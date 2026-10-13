import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const pairs={};
const input=fs.existsSync(path.join(root,'.env'))?fs.readFileSync(path.join(root,'.env'),'utf8'):'';
for(const line of input.split(/\r?\n/)){
  const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if(m&&process.env[m[1]]===undefined)pairs[m[1]]=m[2].trim();
}
const env={...pairs,...process.env};
const missing=[];
let origin;
try {origin=new URL(env.VANO_PUBLIC_ORIGIN);}catch{missing.push('VANO_PUBLIC_ORIGIN HTTPS');}
if(origin && (origin.protocol!=='https:'||origin.origin!==env.VANO_PUBLIC_ORIGIN))missing.push('VANO_PUBLIC_ORIGIN com HTTPS e sem caminho');
for(const key of ['RESEND_API_KEY','VANO_EMAIL_FROM'])if(!env[key])missing.push(key);
if(!env.VANO_SECURITY_SECRET||env.VANO_SECURITY_SECRET.length<32||env.VANO_SECURITY_SECRET.startsWith('REPLACE_'))missing.push('VANO_SECURITY_SECRET aleatório (32+ caracteres)');
if(!env.DATABASE_URL&&env.VANO_ALLOW_SINGLE_INSTANCE_JSON!=='1')missing.push('DATABASE_URL PostgreSQL ou armazenamento JSON privado explicitamente autorizado');
if(!env.VANO_V1_API_URL&&!env.MAPBOX_SECRET_TOKEN&&!env.VITE_MAPBOX_PUBLIC_TOKEN)missing.push('provedor de rotas real');
if(env.VITE_DEMO_MODE==='true')missing.push('modo demo deve estar desligado');
if(!fs.existsSync(path.join(root,'dist','index.html')))missing.push('dist/index.html: rode npm run build');
if(!fs.existsSync(path.join(root,'package-lock.json')))missing.push('package-lock.json: rode npm install no Zorin e versione o lockfile');
if(missing.length){console.error('PRODUÇÃO NÃO LIBERADA:\n- '+missing.join('\n- '));process.exit(1)}
console.log('Configuração básica presente. Ainda exige npm audit, smoke test HTTPS, DNS/e-mail e revisão externa.');
