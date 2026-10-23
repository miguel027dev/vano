import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const emptyData = () => ({ users: [], sessions: [], favorites: [], history: [], reports: [], preferences: [], routines: [], usedProofs: [], emailTokens: [], oauthStates: [], intelligence: [], intelligenceNavigation: [] });
export function openStore(filename) {
  const file = path.resolve(filename);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const directory = fs.lstatSync(dir);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw Error('Diretório do banco inválido.');
  // Never chmod an arbitrary existing directory such as /tmp or a shared mount.
  if ((directory.mode & 0o077) !== 0) throw Error(`Diretório do banco deve ser privado (chmod 700 ${dir}).`);

  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('Banco não pode ser um link simbólico.');
  const lockPath = `${file}.lock`;
  // Single-process JSON: fail closed if a second instance is started accidentally.
  if (fs.existsSync(lockPath)) {
    let previous = 0;
    try { previous = Number(fs.readFileSync(lockPath,'utf8')); } catch { /* unsafe/invalid lock */ }
    if (Number.isInteger(previous) && previous > 0) {
      try { process.kill(previous,0); throw Error(`Banco em uso por outro processo (${previous}).`); }
      catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
    fs.unlinkSync(lockPath);
  }
  const lockFd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  fs.writeFileSync(lockFd,String(process.pid));fs.closeSync(lockFd);
  const release = () => { try { if (fs.readFileSync(lockPath,'utf8') === String(process.pid)) fs.unlinkSync(lockPath); } catch {} };
  process.on('exit',release);
  process.once('SIGINT',()=>process.exit(0));
  process.once('SIGTERM',()=>process.exit(0));
  let data = emptyData();
  try {
    const stat = fs.statSync(file);
    if (stat.size > 64 * 1024 * 1024) throw Error('Banco excede tamanho máximo suportado.');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Formato de banco inválido.');
    data = { ...emptyData(), ...parsed };
    for (const key of Object.keys(emptyData())) if (!Array.isArray(data[key])) throw Error(`Coleção de banco inválida: ${key}`);
    fs.chmodSync(file, 0o600);
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`Falha de integridade do banco: ${e.message}. Aplicação interrompida para proteger os dados.`);
  }
  function save({ backup = true } = {}) {
    // Explicit backups, private temporary file and atomic rename prevent half-written stores.
    const tmp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
    let fd;
    try {
      fd = fs.openSync(tmp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
      fs.writeFileSync(fd, JSON.stringify(data));
      fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      if (backup && fs.existsSync(file)) {
        fs.copyFileSync(file, file + '.bak');
        fs.chmodSync(file + '.bak', 0o600);
      }
      fs.renameSync(tmp, file);
      fs.chmodSync(file, 0o600);
      try { const dirFd = fs.openSync(dir, 'r'); fs.fsyncSync(dirFd); fs.closeSync(dirFd); } catch { /* not supported on every FS */ }
    } catch (e) {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(tmp); } catch { /* already moved */ }
      throw e;
    }
  }
  return { data, save, filename: file };
}
