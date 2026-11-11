/** Verify VANO V2 scrypt plus V1 PBKDF2/Argon2id credentials. Never log passwords. */
import { pbkdf2Sync, scryptSync, timingSafeEqual } from 'node:crypto';

const limit = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const matches = (a,b) => a.length === b.length && timingSafeEqual(a,b);
export const isLegacyHash = stored => typeof stored === 'string' &&
  (stored.startsWith('pbkdf2_sha256$') || stored.startsWith('$argon2id$'));

export async function verifyVanoPassword(password, stored) {
  if (!limit(password) || !limit(stored)) return false;
  try {
    if (stored.startsWith('$argon2id$')) {
      const mod = await import('argon2');
      const verify = mod.verify || mod.default?.verify;
      return typeof verify === 'function' && Boolean(await verify(stored,password));
    }
    if (stored.startsWith('pbkdf2_sha256$')) {
      const [algorithm,n,salt,digest] = stored.split('$');
      const iterations = Number(n);
      if (algorithm!=='pbkdf2_sha256' || !Number.isInteger(iterations) || iterations<10000 || iterations>2000000 ||
          !/^[a-f0-9]{32,128}$/i.test(salt) || !/^[a-f0-9]{64}$/i.test(digest)) return false;
      const actual = pbkdf2Sync(password,Buffer.from(salt,'hex'),iterations,32,'sha256');
      return matches(actual, Buffer.from(digest,'hex'));
    }
    const [salt,digest,other] = stored.split(':');
    if (other || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(digest)) return false;
    const actual = scryptSync(password,salt,64);
    return matches(actual, Buffer.from(digest,'hex'));
  } catch { return false; }
}
