/** VANO API — hardened, single-process implementation.
 * Public deployments require HTTPS reverse proxy + persistent private storage.
 * This small local store is deliberately NOT a multi-instance database.
 */
import http from 'node:http';
import {readMobileRequest,mobileGrants,mobileCallback,canonicalMobileStart} from './mobile-auth.mjs';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { places, demoRoutes, pointOK } from './routing.mjs';
import {benchmarkCapabilities,benchmarkScenarios,parseBenchmarkParams,summarizeBenchmark,PUBLIC_BENCHMARK_RATE} from './benchmark.mjs';
import { queryPlaces, queryNearbyCategory } from './search-provider.mjs';
import {parseReverseCoords,normalizedReverseAddress} from './reverse-geocode.mjs';
import { directionsFromV1 } from './v1-bridge.mjs';
import { calculateMapboxV1Candidates } from './mapbox-v1-fallback.mjs';
import { calculateWalkingRoute } from './walking-route.mjs';
import {parseBBox,queryPublicMap,filterVerifiedReports,PUBLIC_MAP_SOURCES} from './map-public-data.mjs';
import {parseTrafficBBox,configuredPublicTraffic,TRAFFIC_PROVIDER_CATALOG} from './traffic-public.mjs';
import {isAdminAccount,adminMetrics,adminUsers} from './admin.mjs';
import {PUBLIC_PATHS} from '../seo/catalog.mjs';
import { LANGUAGES, getLocaleSuggestion, normalizeLocale } from './locale.mjs';
import { googleOAuthStatus, canonicalGoogleStart, newOAuthToken, hashState, googleAuthUrl, fetchGoogleIdentity } from './google-oauth.mjs';
import { openStore } from './storage.mjs';
import { openPostgresStore } from './storage-pg.mjs';
import { hex, sha256, safeEqual, isEmail, validPassword, validName, cleanText, reportPublic, createLimiter, signedToken, openSignedToken, csrfToken, correctOrigin, secureHeaders } from './security.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}
const production = process.env.NODE_ENV === 'production';
const origin = process.env.VANO_PUBLIC_ORIGIN || '';
const mailReady = Boolean(process.env.RESEND_API_KEY && process.env.VANO_EMAIL_FROM);
const startupMs = Date.now();
const SESSION_MAX_AGE=90*86400;
const runtimeMetrics = { requests:0,routeRequests:0,routeErrors:0,routeLatencyMs:0,pageViews:Object.create(null) };
let benchmarkInFlight=0;
const googleStatus = googleOAuthStatus(process.env);
const googleReady = googleStatus.ready;
console.info('VANO Google OAuth:', googleReady ? 'configurado' : googleStatus.reason);
if (production) {
  let publicUrl;try{publicUrl=new URL(origin);}catch{throw Error('VANO_PUBLIC_ORIGIN inválida.');}
  if (!origin || publicUrl.protocol !== 'https:' || publicUrl.origin !== origin || publicUrl.username || publicUrl.password) throw Error('Produção exige VANO_PUBLIC_ORIGIN=https://seu-dominio');
  if (!process.env.VANO_SECURITY_SECRET || process.env.VANO_SECURITY_SECRET.length < 32) throw Error('Produção exige VANO_SECURITY_SECRET com no mínimo 32 caracteres.');
  if (!process.env.DATABASE_URL && process.env.VANO_ALLOW_SINGLE_INSTANCE_JSON !== '1') throw Error('Produção exige DATABASE_URL PostgreSQL ou autorização explícita de JSON single-instance.');
  if (!mailReady || process.env.RESEND_API_KEY.startsWith('REPLACE_') || !process.env.VANO_EMAIL_FROM.includes('@')) throw Error('Produção exige e-mail verificado: RESEND_API_KEY e VANO_EMAIL_FROM reais.');
  if (process.env.VANO_SECURITY_SECRET.startsWith('REPLACE_')) throw Error('Substitua o segredo de exemplo antes da produção.');
  if (!process.env.VITE_MAPBOX_PUBLIC_TOKEN?.startsWith('pk.')) throw Error('Produção exige token público Mapbox válido no build e no servidor.');
  if(process.env.VANO_V1_API_URL){
    const v1=new URL(process.env.VANO_V1_API_URL);
    if(v1.protocol!=='https:' && !(v1.protocol==='http:'&&['localhost','127.0.0.1','::1'].includes(v1.hostname)))throw Error('API V1 remota exige HTTPS.');
  }
  if (process.env.VITE_DEMO_MODE === 'true') throw Error('Produção não pode usar VITE_DEMO_MODE=true.');
  if (!(process.env.VANO_V1_API_URL || process.env.MAPBOX_SECRET_TOKEN || process.env.VITE_MAPBOX_PUBLIC_TOKEN)) throw Error('Produção exige roteador real configurado.');
}
const port = Number(process.env.PORT || process.env.API_PORT || 8878);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('API_PORT inválida.');
const file = process.env.VANO_DATA_FILE ? path.resolve(root, process.env.VANO_DATA_FILE) : path.join(root, 'data', 'store.json');
if(process.env.VANO_REQUIRE_POSTGRES==='1' && !process.env.DATABASE_URL)throw Error('VANO_REQUIRE_POSTGRES ativo mas DATABASE_URL ausente.');
const store = process.env.DATABASE_URL ? await openPostgresStore(process.env.DATABASE_URL) : openStore(file);
console.info('VANO V2 storage:',store.kind||'json-ephemeral');
const db = store.data;
const persist = async opts => {
  const time=Date.now();
  db.sessions=db.sessions.filter(x=>x.expires>time);
  db.emailTokens=db.emailTokens.filter(x=>x.expires>time);
  db.oauthStates=db.oauthStates.filter(x=>x.expires>time).slice(-100);
  db.usedProofs=db.usedProofs.filter(x=>x.expires>time).slice(-3000);
  // Unverified incident reports expire after 30 days; verified community data after 180 days.
  db.reports=db.reports.filter(x=>new Date(x.createdAt).getTime()>(time-(x.status==='verificado'?180:30)*86400000));
  await store.save(opts);
};
// Invalidate legacy plaintext sessions once, without leaving a plaintext backup.
let migrated = false;
if (db.sessions.some(s => Object.hasOwn(s, 'token') || !s.tokenHash)) {
  db.sessions = db.sessions.filter(s => s.tokenHash && !s.token && Number.isFinite(s.expires));
  migrated = true;
}
for (const u of db.users) {
  if (!Object.hasOwn(u,'verifiedAt')) {u.verifiedAt=production?null:(u.createdAt||stampLegacy());migrated=true;}
  if (!Object.hasOwn(u,'verificationMethod')) {u.verificationMethod='legacy';migrated=true;}
  if (production && !['email','google'].includes(u.verificationMethod) && u.verifiedAt) {u.verifiedAt=null;migrated=true;}
}
function stampLegacy(){return new Date().toISOString();}
if (migrated) {
  try { fs.rmSync(file + '.bak', { force: true }); } catch { /* best effort */ }
  await persist({ backup: false });
}
const secret = process.env.VANO_SECURITY_SECRET || hex(32);
const limiter = createLimiter();
const nativeGrants=mobileGrants();
const headers = secureHeaders(production);
const now = () => Date.now();
const stamp = () => new Date().toISOString();
const safeUser = u => u ? { id: u.id, name: u.name, email: u.email, verified: Boolean(u.verifiedAt),googleLinked:Boolean(u.googleSub),isAdmin:isAdminAccount(u) } : null;
const json = (res, status, data, extra = {}) => {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', ...extra });
  res.end(JSON.stringify(data));
};
const err = (res, status, message, extra = {}) => json(res, status, { error: message }, extra);
const normEmail = input => typeof input === 'string' && input.length <= 180 ? cleanText(input,180).toLowerCase() : '';
const safeStr = cleanText;
function cookie(req, key) {
  const pair = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${key}=`));
  return pair?.slice(key.length + 1) || '';
}
const secured = production || process.env.VANO_DEV_HTTPS === '1' || googleStatus.callbackOrigin?.startsWith('https://') === true;
function setCookie(key, value, maxAge) {
  return `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; ${secured ? 'Secure; ' : ''}Max-Age=${maxAge}`;
}
function token() { return hex(32); }
function userSession(req) {
  const value = cookie(req, 'vano_session');
  if (!/^[a-f0-9]{64}$/.test(value)) return null;
  const sessionHash = sha256(value);
  const found = db.sessions.find(s => s.tokenHash === sessionHash && s.expires > now());
  const user = found && db.users.find(u => u.id === found.userId);
  return user ? { user, hash: sessionHash } : null;
}
function currentUser(req) { return safeUser(userSession(req)?.user); }
function guestToken(req) {
  const value = req.vanoGuest || cookie(req, 'vano_guest');
  return /^[a-f0-9]{32}$/.test(value) ? value : null;
}
function guestCookie(req) {
  if (userSession(req) || guestToken(req)) return null;
  req.vanoGuest = hex(16);
  return setCookie('vano_guest', req.vanoGuest, 604800);
}
function owner(req) {
  const user = currentUser(req);
  return user?.id || (guestToken(req) ? `guest:${guestToken(req)}` : null);
}
function csrfFor(req) {
  const session = userSession(req);
  const subject = session ? `session:${session.hash}` : `guest:${guestToken(req) || ''}`;
  return csrfToken(secret, subject);
}
function csrfForSession(value) { return csrfToken(secret, `session:${sha256(value)}`); }
function adoptGuest(req, userId) {
  const previous = guestToken(req) ? `guest:${guestToken(req)}` : null;
  if (!previous) return;
  for (const key of ['favorites', 'history', 'routines', 'preferences'])
    for (const record of db[key]) if (record.owner === previous) record.owner = userId;
}
function createSession(userId) {
  db.sessions = db.sessions.filter(s => s.expires > now());
  const own=db.sessions.filter(s=>s.userId===userId).sort((a,b)=>a.expires-b.expires);
  if(own.length>=10){const oldest=new Set(own.slice(0,own.length-9));db.sessions=db.sessions.filter(s=>!oldest.has(s));}
  const raw = token();
  db.sessions.push({ tokenHash: sha256(raw), userId, expires: now() + SESSION_MAX_AGE*1000, createdAt: stamp() });
  return raw;
}
function passwordHash(password, salt = hex(16)) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function passwordMatches(password, stored) {
  try {
    if (typeof password !== 'string' || password.length > 128) return false;
    const [salt, value] = stored.split(':');
    const actual = scryptSync(password, salt, 64), expected = Buffer.from(value, 'hex');
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
const dummyHash = passwordHash(hex(20));
function remoteIP(req) {
  const direct=String(req.socket.remoteAddress||'unknown');
  if(process.env.VANO_TRUST_PROXY==='1' && /^(127\.|::1$|::ffff:127\.)/.test(direct)){
    const candidate=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
    if(net.isIP(candidate))return candidate;
  }
  return direct;
}
function limits(req, res, key, max, ms = 60000) {
  const ip = remoteIP(req).slice(0,80);
  const result = limiter(`${key}:ip:${ip}`, max, ms);
  if (!result.allowed) { err(res, 429, 'Muitas solicitações. Aguarde antes de tentar novamente.', { 'Retry-After': String(result.retryAfter) }); return false; }
  return true;
}
function limitAccount(res, key, id, max, ms = 900000) {
  const result = limiter(`${key}:account:${sha256(id)}`, max, ms);
  if (!result.allowed) { err(res, 429, 'Muitas tentativas. Aguarde antes de tentar novamente.', { 'Retry-After': String(result.retryAfter) }); return false; }
  return true;
}
function requireAccount(req, res) {
  const user = currentUser(req);
  if (!user) err(res, 401, 'Entre na sua conta.');
  return user;
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function getBody(req) {
  return new Promise((resolve, reject) => {
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return reject(new HttpError(415, 'Envie Content-Type application/json.'));
    let bytes = 0, chunks = [], overflow = false;
    req.on('data', ch => {
      bytes += ch.length;
      if (bytes > 32768) { if (!overflow) { overflow = true; reject(new HttpError(413, 'Dados muito grandes.')); } chunks = []; return; }
      if (!overflow) chunks.push(ch);
    });
    req.on('end', () => {
      if (overflow) return;
      try { const obj = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!obj || Array.isArray(obj) || typeof obj !== 'object') throw Error('Objeto JSON esperado'); resolve(obj); }
      catch { reject(new HttpError(400, 'JSON inválido.')); }
    });
    req.on('error', reject);
  });
}
function ownRecords(name, id) { return db[name].filter(x => x.owner === id).sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')); }
function prefFor(id, suggestedLanguage='pt-BR') {
  const saved=db.preferences.find(x=>x.owner===id)||{};
  return {vehicle:'carro',preferredRoute:'safe',theme:'light',language:suggestedLanguage,alerts:true,routineTags:[],onboardingComplete:false,...saved,...(!saved.languageConfirmed?{language:suggestedLanguage}:{})};
}
function bootstrap(req) {
  const id = owner(req);
  const reports = db.reports.filter(r => r.status === 'verificado' || (id && r.owner === id)).slice(-40).reverse().map(reportPublic);
  const localeSuggestion=getLocaleSuggestion(req.headers,process.env.VANO_TRUST_GEO_HEADERS==='1');
  const languageExplicit=Boolean(db.preferences.find(x=>x.owner===id && x.languageConfirmed===true && LANGUAGES.has(x.language)));
  return { user: currentUser(req), localeSuggestion, languageExplicit, preferences: (({owner,...rest})=>rest)(prefFor(id,localeSuggestion.language)), favorites: ownRecords('favorites', id).map(({owner,...rest})=>rest), history: ownRecords('history', id).map(({owner,...rest})=>rest), reports, googleReady, routines: ownRecords('routines', id).map(({owner,...rest})=>rest), csrfToken: csrfFor(req), demo: !Boolean(process.env.VANO_V1_API_URL || process.env.MAPBOX_SECRET_TOKEN || process.env.VITE_MAPBOX_PUBLIC_TOKEN) };
}
async function sendEmail(to, subject, html) {
  if (!mailReady) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST', headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ from:process.env.VANO_EMAIL_FROM, to:[to], subject, html }), signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error('Falha no envio de e-mail.');
  return true;
}
function issueEmailToken(id, kind, ttl = 1800000) {
  const raw = token();
  db.emailTokens = db.emailTokens.filter(x => x.expires > now() && !(x.userId === id && x.kind === kind));
  db.emailTokens.push({ tokenHash:sha256(raw), userId:id, kind, expires:now() + ttl });
  return raw;
}
async function emailAction(user, kind) {
  const previous=db.emailTokens.filter(x=>x.userId===user.id&&x.kind===kind);
  const raw = issueEmailToken(user.id, kind);
  const base = origin || 'http://localhost:5174';
  const relative = kind === 'verify' ? `/api/auth/verify?token=${raw}` : `/redefinir-senha?token=${raw}`;
  const link = new URL(relative, base).toString();
  const html = `<div style="font-family:Arial,sans-serif"><h2>VANO Maps</h2><p>${kind === 'verify' ? 'Confirme seu e-mail para acessar sua conta.' : 'Você solicitou a redefinição da sua senha.'}</p><p><a href="${link}">Continuar com segurança</a></p><p>Link temporário. Se não reconhece esta solicitação, ignore este e-mail.</p></div>`;
  if (!mailReady) return false;
  try {await sendEmail(user.email, kind === 'verify' ? 'Confirme seu e-mail VANO' : 'Redefina sua senha VANO', html);}
  catch (e) { db.emailTokens=db.emailTokens.filter(x=>!(x.userId===user.id&&x.kind===kind)).concat(previous);throw e; }
  return true;
}
async function search(query,language='pt-BR',proximity=null) {
  const text=safeStr(query,256).trim();
  if(text.length<2)return [];
  const access=process.env.MAPBOX_SECRET_TOKEN || process.env.VITE_MAPBOX_PUBLIC_TOKEN;
  if(!access){
    if(production)throw new HttpError(503,'A busca de endereços está temporariamente indisponível.');
    return places.filter(x=>x.name.toLocaleLowerCase().includes(text.toLocaleLowerCase())).slice(0,6);
  }
  const outcome=await queryPlaces(text,{token:access,language,proximity});
  if(!outcome.providerOk)throw new HttpError(503,'O serviço de endereços não respondeu. Tente novamente.');
  return outcome.results;
}
async function directions(originPoint, destination, vehicle = 'carro', telemetry = {}, language = 'pt-BR', options = {}) {
  if (!pointOK(originPoint) || !pointOK(destination)) throw new HttpError(400, 'Coordenadas inválidas.');
  if (!['carro', 'moto', 'a-pe'].includes(vehicle)) throw new HttpError(400, 'Veículo inválido.');
  if (vehicle==='a-pe') {
    const token=process.env.MAPBOX_SECRET_TOKEN || process.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if(!token)throw new HttpError(503,'Roteamento a pé não configurado.');
    try{return await calculateWalkingRoute(originPoint,destination,LANGUAGES.has(language)?language:'pt-BR',options,token);}
    catch{throw new HttpError(503,'Não foi possível calcular uma rota a pé. Tente novamente.');}
  }
  if (process.env.VANO_V1_API_URL?.trim()) return directionsFromV1(process.env.VANO_V1_API_URL.trim(), originPoint, destination, vehicle, telemetry, { ...options, timeoutMs: Number(process.env.VANO_ORIGINAL_ENGINE_TIMEOUT_MS) || 65000 });
  const access = process.env.MAPBOX_SECRET_TOKEN || process.env.VITE_MAPBOX_PUBLIC_TOKEN;
  if (access) {
    try {
      // Preserve the audited V1 order: base traffic routes, conditional adaptive
      // candidates, bounded parallel micro-bypasses, exact dedupe, minimum ETA.
      return await calculateMapboxV1Candidates(originPoint,destination,vehicle,telemetry,
        LANGUAGES.has(language)?language:'pt-BR',options,access);
    } catch (error) {
      console.warn('VANO Mapbox candidate engine unavailable:',error?.message||String(error));
      throw new HttpError(503,'Serviço de rotas indisponível. Tente novamente.');
    }
  }
  if (production) throw new HttpError(503, 'Roteamento não configurado.');
  return demoRoutes(originPoint, destination, vehicle);
}
async function previewDirections(originPoint,destination,telemetry,language,options={}){
  const vehicles=['carro','moto','a-pe'];
  const settled=await Promise.allSettled(vehicles.map(async vehicle=>[vehicle,await directions(originPoint,destination,vehicle,telemetry,language,options)]));
  const modes={};
  settled.forEach((entry,index)=>{
    const vehicle=vehicles[index];
    modes[vehicle]=entry.status==='fulfilled'
      ?{status:'ready',data:entry.value}
      :{status:'unavailable',message:'Não foi possível calcular esta opção agora.'};
  });
  return {modes};
}
function signedRouteProof(route, dest, ownerId) {
  if (!['fast','safe'].includes(route.id) || !Number.isFinite(route.duration) || route.duration<=0 || route.duration>10080 || !Number.isFinite(route.distance) || route.distance<=0 || route.distance>3000) return null;
  return signedToken(secret, {type:'trip',nonce:hex(12),user:ownerId,kind:route.id,dest,mins:route.duration,km:route.distance,expires:now()+10*60*1000});
}
function verifyRouteProof(raw, ownId, destination) {
  const p = openSignedToken(secret, raw);
  if (!p || p.type !== 'trip' || p.user !== ownId || p.expires <= now() || p.expires > now()+601000 || !pointOK(p.dest) || !pointOK(destination) || p.dest.some((v,i)=>Math.abs(v-destination[i])>0.00001) || !['safe','fast'].includes(p.kind) || !Number.isFinite(p.mins) || !Number.isFinite(p.km) || p.mins<=0 || p.km<=0 || p.mins>10080 || p.km>3000) return null;
  if (db.usedProofs.some(x=>x.hash===sha256(raw))) return null;
  return p;
}
function protectedWrite(req, res) {
  if (!correctOrigin(req, production ? origin : '')) { err(res,403,'Origem não autorizada.'); return false; }
  if (!guestToken(req) && !userSession(req)) { err(res,403,'Atualize a página para iniciar uma sessão válida.'); return false; }
  if (!safeEqual(String(req.headers['x-vano-csrf'] || ''), csrfFor(req))) { err(res,403,'Sessão de segurança expirada. Atualize a página.'); return false; }
  return true;
}
function requestHTTPS(req, res) {
  if (!production) return true;
  // This API must be hosted behind a trusted HTTPS reverse proxy and not exposed directly.
  if (req.headers['x-forwarded-proto'] !== 'https') { err(res,426,'Acesso HTTPS obrigatório.'); return false; }
  return true;
}
function listCap(list, ownerId, max) { return list.reduce((n,x)=>n+(x.owner===ownerId?1:0),0)<max; }
async function route(req, res) {
  const u = new URL(req.url,'http://localhost');
  const pathname = u.pathname;
  // Public agent/human benchmarking: same real route engine, no account, no writes.
  if((pathname==='/api/benchmark/v1/capabilities'||pathname==='/.well-known/vano-benchmark.json')&&req.method==='GET'){
    const enabled=process.env.VANO_PUBLIC_BENCHMARK_ENABLED!=='0';
    return json(res,enabled?200:503,benchmarkCapabilities({
      originalEngine:Boolean(process.env.VANO_V1_API_URL?.trim()),
      baseUrl:origin||'http://localhost:5174',enabled
    }));
  }
  if(pathname==='/api/benchmark/v1/scenarios'&&req.method==='GET'){
    if(process.env.VANO_PUBLIC_BENCHMARK_ENABLED==='0')return err(res,503,'Benchmark temporariamente desativado.');
    if(!limits(req,res,'public-benchmark-scenarios',25,60000))return;
    const value=u.searchParams.get('limit')??'8';
    if(!/^([1-8])$/.test(value))return err(res,400,'limit deve estar entre 1 e 8.');
    const scenarios=benchmarkScenarios(Number(value));
    return json(res,200,{ok:true,protocol:'vano-route-benchmark',version:'2.0',count:scenarios.length,scenarios});
  }
  if(pathname==='/api/benchmark/v1/route'&&req.method==='GET'){
    if(process.env.VANO_PUBLIC_BENCHMARK_ENABLED==='0')return err(res,503,'Benchmark temporariamente desativado.');
    const benchmark=parseBenchmarkParams(u.searchParams,{originalEngine:Boolean(process.env.VANO_V1_API_URL?.trim())});
    if(benchmark.error)return json(res,benchmark.status,{ok:false,error:benchmark.error,message:benchmark.message});
    if(!limits(req,res,'public-benchmark-route',PUBLIC_BENCHMARK_RATE,60000))return;
    if(benchmarkInFlight>=2)return json(res,429,{ok:false,error:'busy',message:'Servidor ocupado. Repita o teste em alguns instantes.'},{'Retry-After':'10'});
    benchmarkInFlight++;
    const started=performance.now(),requestId=randomBytes(8).toString('hex');
    try{
      const result=await directions(benchmark.origin,benchmark.destination,benchmark.vehicle,{},'pt-BR',{
        adaptive:benchmark.adaptive,variantBudget:benchmark.variantBudget,
        includeAdvanced:['smart','quietest'].includes(benchmark.mode),
        avoidTolls:benchmark.avoid_tolls,avoidFerries:benchmark.avoid_ferries,
        avoidUnpaved:benchmark.avoid_unpaved
      });
      if(result.source==='demonstracao')return json(res,503,{ok:false,error:'provider_unavailable',message:'Benchmark requer rotas reais; dados de demonstração não são aceitos.'});
      const report=summarizeBenchmark(result,benchmark,{requestId,elapsedMs:performance.now()-started});
      if(report.error)return json(res,report.status,{ok:false,error:report.error,message:report.message});
      return json(res,200,report);
    }finally{benchmarkInFlight--;}
  }
  if (pathname === '/api/health' && req.method === 'GET') return json(res,200,{ok:true,mapboxConfigured:!!process.env.VITE_MAPBOX_PUBLIC_TOKEN,googleReady,googleIssue:googleStatus.reason,v1BridgeConfigured:!!process.env.VANO_V1_API_URL,production,mailConfigured:mailReady,storage:store.kind||'json-ephemeral',persistentDb:store.persistent===true});
  if (pathname === '/api/engine/status' && req.method === 'GET') {
    const configured=Boolean(process.env.VANO_V1_API_URL?.trim());
    if(!configured)return json(res,200,{configured:false,online:false,mode:'mapbox-fallback'});
    const address=new URL('/healthz',process.env.VANO_V1_API_URL);
    const started=performance.now();
    try {
      const upstream=await fetch(address,{signal:AbortSignal.timeout(2500),headers:{Accept:'application/json'}});
      const safeBody=upstream.ok?await upstream.json().catch(()=>({})):{};
      return json(res,upstream.ok?200:503,{configured:true,online:upstream.ok,mode:'original-python',dbReady:upstream.ok,mapboxConfigured:safeBody.mapbox_configured===true,latencyMs:Math.round(performance.now()-started)});
    }catch{return json(res,503,{configured:true,online:false,mode:'original-python',dbReady:false});}
  }
  if ((pathname === '/api/admin' || pathname === '/api/admin/users') && req.method === 'GET') {
    const session=userSession(req);
    if(!session)return err(res,401,'Entre na sua conta para acessar o console.');
    if(!isAdminAccount(session.user))return err(res,403,'Acesso administrativo não autorizado.');
    if(!limits(req,res,'admin-console',30,60000))return;
    if(pathname==='/api/admin/users')return json(res,200,adminUsers(db,{offset:u.searchParams.get('offset'),limit:u.searchParams.get('limit')}));
    return json(res,200,adminMetrics(db,runtimeMetrics,{now:Date.now(),startedAt:startupMs,status:{google:googleReady,mapbox:!!process.env.VITE_MAPBOX_PUBLIC_TOKEN,v1Router:!!process.env.VANO_V1_API_URL,email:mailReady,persistentDb:store.persistent===true,storage:store.persistent?'PostgreSQL (vano_v2.app_state)':'JSON da instância atual — dados podem desaparecer com reinícios no Render Free'}}));
  }
  if (pathname === '/api/bootstrap' && req.method === 'GET') {
    const session=userSession(req);let refreshCookie=null;
    if(session){const stored=db.sessions.find(s=>s.tokenHash===session.hash);if(stored&&stored.expires<now()+(SESSION_MAX_AGE-86400)*1000){stored.expires=now()+SESSION_MAX_AGE*1000;await persist();refreshCookie=setCookie('vano_session',cookie(req,'vano_session'),SESSION_MAX_AGE);}}
    const newGuest=guestCookie(req);return json(res,200,bootstrap(req),(refreshCookie||newGuest)?{'Set-Cookie':refreshCookie||newGuest}:{});
  }
  if (pathname === '/api/auth/google/start' && req.method === 'GET') {
    if(!googleReady)return err(res,503,'Login Google ainda não configurado.');
    if(!limits(req,res,'google-start',15,300000))return;
    let native;try{native=readMobileRequest(u.searchParams);}catch(e){return err(res,400,e.message);}
    const linking=u.searchParams.get('link')==='1';
    if(native&&linking)return err(res,400,'Entre com e-mail para conectar o Google nas configurações da conta.');
    // The Google callback must share the cookie's exact hostname.
    // Example: vanomaps.online -> vanu-73xu.onrender.com before setting the state cookie.
    // Redirect destination is from trusted server configuration, never request Host.
    const canonical=canonicalGoogleStart(req.headers.host,process.env);
    if(canonical){
      if(linking)return err(res,409,'Para vincular o Google, entre na sua conta pelo endereço oficial deste serviço.');
      res.writeHead(302,{...headers,'Cache-Control':'no-store','Location':canonicalMobileStart(canonical,native)});
      res.end();return;
    }
    const state=newOAuthToken(), verifier=newOAuthToken(48);
    const session=linking?userSession(req):null;
    if(linking&&!session)return err(res,401,'Entre na conta VANO antes de conectar o Google.');
    db.oauthStates.push({native,stateHash:hashState(state),verifier,expires:now()+600000,linkUserId:session?.user.id||null,linkSessionHash:session?.hash||null});
    db.oauthStates=db.oauthStates.filter(x=>x.expires>now()).slice(-100);
    await persist();
    res.writeHead(302,{...headers,'Cache-Control':'no-store','Location':googleAuthUrl(process.env,state,verifier),'Set-Cookie':setCookie('vano_oauth',state,600)});
    res.end();return;
  }
  if ((pathname === '/api/auth/google/callback' || pathname === '/login/google/callback') && req.method === 'GET') {
    const state=u.searchParams.get('state')||'', source=cookie(req,'vano_oauth');
    const record=(state.length>=20 && state.length<=200 && safeEqual(state,source)) ? db.oauthStates.find(x=>x.stateHash===hashState(state)&&x.expires>now()) : null;
    const drop=setCookie('vano_oauth','',0);
    const failed=(error='erro')=>{res.writeHead(302,{...headers,'Cache-Control':'no-store','Location':record?.native?mobileCallback(record.native.state,null,error):`/entrar?google=${error}`,'Set-Cookie':drop});res.end();};
    if(u.searchParams.has('error')){failed('cancelado');return;}if(!record){console.warn('VANO OAuth: estado ausente, expirado ou cookie de callback não recebido.');failed('estado-expirado');return;}
    db.oauthStates=db.oauthStates.filter(x=>x!==record);await persist();
    try {
      const id=await fetchGoogleIdentity(process.env,u.searchParams.get('code')||'',record.verifier);
      if(record.linkUserId){
        const session=userSession(req);
        if(!session||session.user.id!==record.linkUserId||session.hash!==record.linkSessionHash){
          res.writeHead(302,{...headers,'Location':'/entrar?google=sessao-expirada','Set-Cookie':drop});res.end();return;
        }
        // Only link an identical verified email and never seize another user's Google identity.
        if(id.email!==session.user.email || db.users.some(u=>u.googleSub===id.googleSub && u.id!==session.user.id)){
          res.writeHead(302,{...headers,'Location':'/conta?google=email-divergente','Set-Cookie':drop});res.end();return;
        }
        session.user.googleSub=id.googleSub;
        await persist();
        res.writeHead(302,{...headers,'Location':'/conta?google=vinculado','Set-Cookie':drop});res.end();return;
      }
      let user=db.users.find(x=>x.googleSub===id.googleSub);
      // Successful OIDC exchange re-verifies this existing Google identity.
      // Older migrations incorrectly cleared verifiedAt on Google accounts.
      if(user&&user.email===id.email){
        user.verifiedAt ||= stamp();
        user.verificationMethod='google';
      }
      if(!user){
        // A matching password account requires explicit linking after password login.
        if(db.users.some(x=>x.email===id.email)){
          failed('conta-existente');return;
        }
        user={id:hex(12),name:id.name,email:id.email,googleSub:id.googleSub,passwordHash:passwordHash(newOAuthToken()),createdAt:stamp(),signupMethod:'google',verifiedAt:stamp(),verificationMethod:'google'};
        db.users.push(user);
        const chosen=getLocaleSuggestion(req.headers,process.env.VANO_TRUST_GEO_HEADERS==='1').language;
        db.preferences.push({...prefFor(user.id,chosen),owner:user.id,language:chosen,languageConfirmed:false});
      }
      if(record.native){const code=nativeGrants.issue(user.id,record.native);await persist();res.writeHead(302,{...headers,'Cache-Control':'no-store','Location':mobileCallback(record.native.state,code),'Set-Cookie':drop});res.end();return;}
      const raw=createSession(user.id);await persist();
      const complete=prefFor(user.id).onboardingComplete;
      res.writeHead(302,{...headers,'Cache-Control':'no-store','Location':complete?'/mapa':'/personalizar','Set-Cookie':[drop,setCookie('vano_session',raw,SESSION_MAX_AGE)]});res.end();return;
    }catch(e){console.error('Google OAuth falhou:',e?.message||String(e));failed();return;}
  }
  if (pathname === '/api/auth/verify' && req.method === 'GET') {
    const raw = u.searchParams.get('token');const record = db.emailTokens.find(x=>x.kind==='verify'&&x.tokenHash===sha256(raw||'')&&x.expires>now());
    if (record) { const user=db.users.find(x=>x.id===record.userId);if(user){user.verifiedAt=stamp();user.verificationMethod='email';}db.emailTokens=db.emailTokens.filter(x=>x!==record);await persist(); }
    const where=record?'/entrar?verificado=1':'/entrar?verificado=0';
    res.writeHead(302,{...headers,'Cache-Control':'no-store','Location':where});res.end();return;
  }
  // PKCE replaces cookie/CSRF authentication only for this one-time native exchange.
  if(pathname==='/api/mobile/auth/exchange'&&req.method==='POST'){
    if(!limits(req,res,'mobile-exchange',20,300000))return;
    const body=await getBody(req),uid=nativeGrants.redeem(body);
    const user=uid&&db.users.find(x=>x.id===uid);
    if(!user)return err(res,401,'Retorno de login inválido ou expirado.');
    const raw=createSession(user.id);await persist();
    return json(res,200,{ok:true,cookieName:'vano_session',sessionToken:raw,maxAge:SESSION_MAX_AGE,next:prefFor(user.id).onboardingComplete?'/mapa':'/personalizar'});
  }
  if (req.method !== 'GET' && !protectedWrite(req,res)) return;
  if(!production && !secured && /^\/api\/(auth\/(login|signup|forgot|reset|resend-verification)|profile)/.test(pathname)){
    const hostname = String(req.headers.host||'').split(':')[0];
    if(!['localhost','127.0.0.1','[::1]'].includes(hostname))return err(res,426,'Para usar contas pelo celular, habilite HTTPS confiável.');
  }
  // Open mapped infrastructure within the CURRENT viewport only.
  // OSM is neither exhaustive nor a real-time incident reporting service.
  if(pathname==='/api/map-features/sources'&&req.method==='GET')return json(res,200,{sources:PUBLIC_MAP_SOURCES});
  if(pathname==='/api/map-features'&&req.method==='GET'){
    if(!limits(req,res,'public-map-features',22,60000))return;
    const bbox=parseBBox(u.searchParams.get('bbox'));
    if(!bbox)return err(res,400,'Área do mapa inválida ou grande demais.');
    const publicData=await queryPublicMap(bbox);
    const verified=filterVerifiedReports(db.reports,bbox);
    return json(res,200,{...publicData,features:[...publicData.features,...verified],verifiedReports:verified.length},
      {'Cache-Control':'public, max-age=65'});
  }
  // Open traffic sources are OPTIONAL. Historical datasets never enter the
  // live overlay. The server owns the vetted feed URL, never the browser.
  if(pathname==='/api/traffic/sources'&&req.method==='GET')
    return json(res,200,{sources:TRAFFIC_PROVIDER_CATALOG.map(p=>p.id==='municipal-geojson'
      ?{...p,enabled:Boolean(process.env.VANO_TRAFFIC_OFFICIAL_GEOJSON_URL)}:p)});
  if(pathname==='/api/traffic/public'&&req.method==='GET'){
    if(!limits(req,res,'public-traffic',22,60000))return;
    const bbox=parseTrafficBBox(u.searchParams.get('bbox'));
    if(!bbox)return err(res,400,'Área de trânsito inválida ou muito ampla.');
    const result=await configuredPublicTraffic(bbox,{
      url:process.env.VANO_TRAFFIC_OFFICIAL_GEOJSON_URL||'',
      token:process.env.VANO_TRAFFIC_OFFICIAL_TOKEN||''
    });
    return json(res,200,result,{'Cache-Control':'public, max-age=55'});
  }
  if (pathname === '/api/places' && req.method === 'GET') return json(res,200,places);
  // Address lookup only after location permission; no coordinates are persisted.
  // A strict request limit prevents GPS jitter from exhausting provider quotas.
  if (pathname === '/api/reverse' && req.method === 'GET') {
    if (!limits(req,res,'reverse-geocode',12,60000)) return;
    const point=parseReverseCoords(u.searchParams);
    if(!point)return err(res,400,'Coordenadas inválidas.');
    const access=process.env.MAPBOX_SECRET_TOKEN||process.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if(!access)return err(res,503,'Endereços indisponíveis nesta instância.');
    const language=normalizeLocale(u.searchParams.get('lang'))||'pt-BR';
    const request=new URL('https://api.mapbox.com/search/geocode/v6/reverse');
    request.searchParams.set('longitude',String(point.lon));
    request.searchParams.set('latitude',String(point.lat));
    request.searchParams.set('language',language);
    request.searchParams.set('access_token',access);
    try{
      const response=await fetch(request,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)});
      if(!response.ok)return err(res,502,'Não foi possível identificar o endereço agora.');
      const result=normalizedReverseAddress(await response.json());
      return json(res,200,{found:Boolean(result),address:result});
    }catch{return err(res,503,'Serviço de endereços temporariamente indisponível.');}
  }
  if (pathname === '/api/search' && req.method === 'GET') {
    if (!limits(req,res,'search',90,60000)) return;
    const detected=getLocaleSuggestion(req.headers,process.env.VANO_TRUST_GEO_HEADERS==='1');
    const lang=normalizeLocale(u.searchParams.get('lang'))||prefFor(owner(req),detected.language).language;
    const lon=Number(u.searchParams.get('lng')),lat=Number(u.searchParams.get('lat'));
    const proximity=u.searchParams.has('lng')&&u.searchParams.has('lat')&&pointOK([lon,lat])?[lon,lat]:null;
    return json(res,200,await search(u.searchParams.get('q'),lang,proximity));
  }
  if (pathname === '/api/nearby' && req.method === 'GET') {
    if (!limits(req,res,'nearby-category',24,60000)) return;
    const category=u.searchParams.get('category');
    const lon=Number(u.searchParams.get('lng')),lat=Number(u.searchParams.get('lat'));
    if(!pointOK([lon,lat]))return err(res,400,'Localização inválida para busca próxima.');
    const access=process.env.MAPBOX_SECRET_TOKEN||process.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if(!access)return err(res,503,'Busca de lugares próximos indisponível nesta instância.');
    const detected=getLocaleSuggestion(req.headers,process.env.VANO_TRUST_GEO_HEADERS==='1');
    const lang=normalizeLocale(u.searchParams.get('lang'))||prefFor(owner(req),detected.language).language;
    const result=await queryNearbyCategory(category,[lon,lat],{token:access,language:lang,limit:5,radiusMeters:15000});
    if(!result.providerOk)return err(res,503,'Não foi possível encontrar lugares próximos agora.');
    return json(res,200,result.results,{'Cache-Control':'private, max-age=30'});
  }
  if (pathname === '/api/route' && req.method === 'POST') {
    if (!limits(req,res,'route',10,60000)) return;
    const id=owner(req);const body=await getBody(req);
    if (!pointOK(body.origin)||!pointOK(body.destination)||!['carro','moto','a-pe',undefined].includes(body.vehicle))return err(res,400,'Origem, destino ou veículo inválido.');
    const t=body.telemetry&&typeof body.telemetry==='object'?body.telemetry:{};
    const telemetry={ bearing:typeof t.bearing==='number'&&t.bearing>=0&&t.bearing<360?t.bearing:null, speed:typeof t.speed==='number'&&t.speed>=0&&t.speed<90?t.speed:null };
    const language=normalizeLocale(body.language)||prefFor(id,getLocaleSuggestion(req.headers,process.env.VANO_TRUST_GEO_HEADERS==='1').language).language;
    // The Python original owns risk/traffic/ETA policy. Node only validates input.
    const provided=body.routeOptions&&typeof body.routeOptions==='object'&&!Array.isArray(body.routeOptions)?body.routeOptions:{};
    const routeOptions={
      avoidTolls:provided.avoidTolls===true, avoidFerries:provided.avoidFerries===true,
      avoidUnpaved:provided.avoidUnpaved===true, reroute:provided.reroute===true,
      adaptive:provided.adaptive!==false,includeAdvanced:provided.includeAdvanced===true,
      variantBudget:Number.isInteger(provided.variantBudget)?Math.max(2,Math.min(8,provided.variantBudget)):4,
      localHour:Number.isInteger(provided.localHour)&&provided.localHour>=0&&provided.localHour<=23?provided.localHour:undefined,
      safetyBias:typeof provided.safetyBias==='number'&&Number.isFinite(provided.safetyBias)?provided.safetyBias:undefined,
      trafficBias:typeof provided.trafficBias==='number'&&Number.isFinite(provided.trafficBias)?provided.trafficBias:undefined,
      departAt:typeof provided.departAt==='string'?provided.departAt:undefined,
    };
    runtimeMetrics.routeRequests+=1;
    const routeStarted=performance.now();
    let result;
    try {result=await directions(body.origin,body.destination,body.vehicle||'carro',telemetry,language,routeOptions);}
    catch(e){runtimeMetrics.routeErrors+=1;throw e;}
    finally {runtimeMetrics.routeLatencyMs+=Math.max(0,performance.now()-routeStarted);}
    if (result.source!=='demonstracao') for(const r of result.routes||[]) r.proof=signedRouteProof(r,body.destination,id);
    return json(res,200,result);
  }
  if (pathname === '/api/route-preview' && req.method === 'POST') {
    if (!limits(req,res,'route-preview',6,60000)) return;
    const id=owner(req),body=await getBody(req);
    if (!pointOK(body.origin)||!pointOK(body.destination)) return err(res,400,'Origem ou destino inválidos.');
    const t=body.telemetry&&typeof body.telemetry==='object'?body.telemetry:{};
    const telemetry={bearing:typeof t.bearing==='number'&&t.bearing>=0&&t.bearing<360?t.bearing:null,speed:typeof t.speed==='number'&&t.speed>=0&&t.speed<90?t.speed:null};
    const language=normalizeLocale(body.language)||prefFor(id,getLocaleSuggestion(req.headers,process.env.VANO_TRUST_GEO_HEADERS==='1').language).language;
    runtimeMetrics.routeRequests+=3;
    const routeStarted=performance.now();
    let result;
    try{result=await previewDirections(body.origin,body.destination,telemetry,language,{adaptive:true,variantBudget:4});}
    catch(e){runtimeMetrics.routeErrors+=1;throw e;}
    finally{runtimeMetrics.routeLatencyMs+=Math.max(0,performance.now()-routeStarted);}
    Object.values(result.modes).forEach(mode=>{
      if(mode.status==='ready'&&mode.data?.source!=='demonstracao') for(const route of mode.data.routes||[]) route.proof=signedRouteProof(route,body.destination,id);
    });
    return json(res,200,result);
  }
  if (pathname === '/api/auth/signup' && req.method === 'POST') {
    if (!limits(req,res,'signup',5,3600000)) return;
    const body=await getBody(req),em=normEmail(body.email);
    if (!limitAccount(res,'signup',em,3,3600000)) return;
    if(body.language!==undefined&&!LANGUAGES.has(body.language))return err(res,400,'Idioma inválido.');
    if(!isEmail(em)||!validName(body.name)||!validPassword(body.password)) return err(res,400,'Informe nome, e-mail válido e senha exclusiva de 12 a 128 caracteres.');
    if(db.users.length>=50000) return err(res,503,'Limite de contas deste servidor atingido.');
    if(db.users.some(x=>x.email===em)) return err(res,409,'E-mail já cadastrado.');
    const user={id:hex(12),name:cleanText(body.name,80),email:em,passwordHash:passwordHash(body.password),createdAt:stamp(),signupMethod:'email',verifiedAt:mailReady?null:stamp(),verificationMethod:mailReady?'pending':'dev'};
    db.users.push(user);
    const chosenLanguage=body.language||getLocaleSuggestion(req.headers,process.env.VANO_TRUST_GEO_HEADERS==='1').language;
    db.preferences=db.preferences.filter(x=>x.owner!==user.id);
    db.preferences.push({...prefFor(user.id,chosenLanguage),owner:user.id,language:chosenLanguage,languageConfirmed:true});
    if(mailReady){
      try {await emailAction(user,'verify');await persist();return json(res,201,{verificationRequired:true,message:'Verifique sua caixa de entrada para confirmar o e-mail.'});}
      catch {db.users=db.users.filter(x=>x.id!==user.id);db.preferences=db.preferences.filter(x=>x.owner!==user.id);db.emailTokens=db.emailTokens.filter(x=>x.userId!==user.id);return err(res,503,'Não foi possível enviar a confirmação. Tente novamente.');}
    }
    adoptGuest(req,user.id);const raw=createSession(user.id);await persist();return json(res,201,{user:safeUser(user),csrfToken:csrfForSession(raw)}, {'Set-Cookie':setCookie('vano_session',raw,SESSION_MAX_AGE)});
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    if (!limits(req,res,'login',12,900000))return;
    const body=await getBody(req),em=normEmail(body.email);
    if(!limitAccount(res,'login',em,8,900000))return;
    const user=db.users.find(x=>x.email===em);
    if(!passwordMatches(body.password,user?.passwordHash||dummyHash)||!user)return err(res,401,'E-mail ou senha incorretos.');
    if(!user.verifiedAt || (production && user.verificationMethod!=='email'))return err(res,403,'Confirme seu e-mail para acessar a conta.');
    adoptGuest(req,user.id);const raw=createSession(user.id);await persist();return json(res,200,{user:safeUser(user),csrfToken:csrfForSession(raw)}, {'Set-Cookie':setCookie('vano_session',raw,SESSION_MAX_AGE)});
  }
  if (pathname === '/api/auth/resend-verification' && req.method === 'POST') {
    if(!limits(req,res,'verify-email',3,3600000))return;
    const b=await getBody(req),em=normEmail(b.email);
    if(!limitAccount(res,'verify-email',em,3,3600000))return;
    const user=db.users.find(x=>x.email===em&&!x.verifiedAt);
    if(user&&mailReady){try{await emailAction(user,'verify');await persist();}catch{ /* generic response */ }}
    return json(res,200,{ok:true,message:'Se a conta precisar de confirmação, enviaremos as instruções.'});
  }
  if (pathname === '/api/auth/forgot' && req.method === 'POST') {
    if(!limits(req,res,'forgot',3,3600000))return;
    const b=await getBody(req),em=normEmail(b.email);
    if(!limitAccount(res,'forgot',em,3,3600000))return;
    const user=db.users.find(x=>x.email===em);
    if(user&&mailReady){try{await emailAction(user,'reset');await persist();}catch{ /* generic response */ }}
    return json(res,200,{ok:true,message:'Se o e-mail estiver cadastrado, você receberá as instruções.'});
  }
  if (pathname === '/api/auth/reset' && req.method === 'POST') {
    if(!limits(req,res,'reset',6,3600000))return;
    const b=await getBody(req);if(!validPassword(b.password))return err(res,400,'Escolha uma senha de 12 a 128 caracteres.');
    const rec=db.emailTokens.find(x=>x.kind==='reset'&&x.tokenHash===sha256(b.token||'')&&x.expires>now());
    if(!rec)return err(res,400,'Link expirado ou inválido.');
    const user=db.users.find(x=>x.id===rec.userId);if(!user)return err(res,400,'Link inválido.');
    user.passwordHash=passwordHash(b.password);user.verifiedAt=stamp();user.verificationMethod='email';db.sessions=db.sessions.filter(x=>x.userId!==user.id);
    db.emailTokens=db.emailTokens.filter(x=>x.userId!==user.id);await persist();return json(res,200,{ok:true});
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const key=sha256(cookie(req,'vano_session'));db.sessions=db.sessions.filter(x=>x.tokenHash!==key);await persist();
    return json(res,200,{ok:true}, {'Set-Cookie':setCookie('vano_session','',0)});
  }
  if(pathname==='/api/profile/export'&&req.method==='GET'){
    const account=requireAccount(req,res);if(!account)return;
    if(!limits(req,res,'account-export',6,3600000))return;
    const id=account.id;
    return json(res,200,{user:account,preferences:(({owner,...rest})=>rest)(prefFor(id)),favorites:ownRecords('favorites',id).map(({owner,...rest})=>rest),history:ownRecords('history',id).map(({owner,...rest})=>rest),routines:ownRecords('routines',id).map(({owner,...rest})=>rest),reports:db.reports.filter(x=>x.owner===id).map(reportPublic),exportedAt:stamp()});
  }
  if(pathname==='/api/profile'&&req.method==='PATCH'){
    const account=requireAccount(req,res);if(!account)return;
    const b=await getBody(req);if(!validName(b.name))return err(res,400,'Nome inválido.');
    const rec=db.users.find(x=>x.id===account.id);rec.name=cleanText(b.name,80);await persist();return json(res,200,{user:safeUser(rec)});
  }
  if(pathname==='/api/profile'&&req.method==='DELETE'){
    const account=requireAccount(req,res);if(!account)return;
    if(!limits(req,res,'delete',4,3600000))return;
    const b=await getBody(req),rec=db.users.find(x=>x.id===account.id);
    if(!passwordMatches(b.password,rec.passwordHash))return err(res,401,'Confirme sua senha atual para excluir a conta.');
    db.users=db.users.filter(x=>x.id!==account.id);db.sessions=db.sessions.filter(x=>x.userId!==account.id);
    for(const key of ['favorites','history','routines','preferences','reports'])db[key]=db[key].filter(x=>x.owner!==account.id);
    db.emailTokens=db.emailTokens.filter(x=>x.userId!==account.id);await persist();return json(res,200,{ok:true},{'Set-Cookie':setCookie('vano_session','',0)});
  }
  if(pathname==='/api/preferences'&&req.method==='PATCH'){
    if(!limits(req,res,'writes',90,60000))return;
    const id=owner(req),p=await getBody(req),next={...prefFor(id),owner:id};
    if(p.vehicle!==undefined){if(!['carro','moto'].includes(p.vehicle))return err(res,400,'Veículo inválido.');next.vehicle=p.vehicle;}
    if(p.preferredRoute!==undefined){if(!['safe','fast'].includes(p.preferredRoute))return err(res,400,'Rota inválida.');next.preferredRoute=p.preferredRoute;}
    if(p.theme!==undefined){if(!['light','dark','system'].includes(p.theme))return err(res,400,'Tema inválido.');next.theme=p.theme;}
    if(p.language!==undefined){if(!LANGUAGES.has(p.language))return err(res,400,'Idioma indisponível.');next.language=p.language;next.languageConfirmed=true;}
    if(p.alerts!==undefined){if(typeof p.alerts!=='boolean')return err(res,400,'Alertas inválidos.');next.alerts=p.alerts;}
    if(p.routineTags!==undefined){if(!Array.isArray(p.routineTags))return err(res,400,'Rotina inválida.');const allowed=new Set(['Casa','Trabalho','Faculdade','Academia','Mercado']);next.routineTags=[...new Set(p.routineTags.filter(x=>allowed.has(x)))].slice(0,5);}
    if(p.onboardingComplete!==undefined){if(typeof p.onboardingComplete!=='boolean')return err(res,400,'Preferência inválida.');next.onboardingComplete=p.onboardingComplete;}
    db.preferences=db.preferences.filter(x=>x.owner!==id);db.preferences.push(next);await persist();const {owner:_privateOwner,...publicPref}=next;return json(res,200,publicPref);
  }
  if(pathname==='/api/favorites'&&req.method==='POST'){
    if(!limits(req,res,'writes',90,60000))return;
    const b=await getBody(req),id=owner(req);if(!cleanText(b.name,90)||!pointOK(b.coords))return err(res,400,'Local inválido.');
    if(!listCap(db.favorites,id,100))return err(res,429,'Limite de lugares favoritos atingido.');
    const rec={id:hex(8),owner:id,name:cleanText(b.name,90),address:cleanText(b.address,180),category:cleanText(b.category,30),coords:b.coords,createdAt:stamp()};db.favorites.push(rec);await persist();const {owner:_privateOwner,...publicRec}=rec;return json(res,201,publicRec);
  }
  if(pathname.startsWith('/api/favorites/')&&req.method==='DELETE'){
    const id=pathname.split('/').pop(),own=owner(req);db.favorites=db.favorites.filter(x=>!(x.id===id&&x.owner===own));await persist();return json(res,200,{ok:true});
  }
  if(pathname==='/api/history'&&req.method==='POST'){
    if(!limits(req,res,'history',20,3600000))return;
    const b=await getBody(req),id=owner(req);if(!pointOK(b.destination?.coords))return err(res,400,'Destino inválido.');
    const journeyId=typeof b.journeyId==='string'&&/^[a-zA-Z0-9-]{16,64}$/.test(b.journeyId)?b.journeyId:null;
    const existing=journeyId&&db.history.find(r=>r.owner===id&&r.journeyId===journeyId);
    if(existing){const {owner:_private,...record}=existing;return json(res,200,record);}
    const proof=verifyRouteProof(b.proof,id,b.destination.coords);
    if(!proof)return err(res,422,'Histórico exige uma rota validada pelo servidor. Calcule novamente.');
    const rec={id:hex(8),owner:id,journeyId,measurementVersion:1,travelledMeters:0,destination:{name:cleanText(b.destination.name,100)||'Destino',address:cleanText(b.destination.address,200),coords:b.destination.coords},routeType:proof.kind,duration:proof.mins,distance:proof.km,createdAt:stamp()};
    db.history.push(rec);db.usedProofs.push({hash:sha256(b.proof),expires:proof.expires});
    db.history=db.history.slice(-10000);db.usedProofs=db.usedProofs.filter(x=>x.expires>now()).slice(-3000);await persist();const {owner:_privateOwner,...publicRec}=rec;return json(res,201,publicRec);
  }
  if(pathname==='/api/history/progress'&&req.method==='POST'){
    if(!limits(req,res,'history-progress',300,3600000))return;
    const b=await getBody(req),id=owner(req),record=db.history.find(r=>r.owner===id&&r.journeyId&&r.journeyId===b.journeyId);
    if(!record)return err(res,404,'Trajeto não encontrado.');
    const metres=b.travelledMeters;
    const elapsed=Math.max(0,(now()-Date.parse(record.createdAt))/1000);
    if(!Number.isFinite(metres)||metres<0||metres>3000000||metres>elapsed*75+100)return err(res,400,'Distância percorrida inválida.');
    record.measurementVersion=1;record.travelledMeters=Math.max(record.travelledMeters||0,Math.round(metres));
    await persist();const {owner:_private,...publicRecord}=record;return json(res,200,publicRecord);
  }
  if(pathname==='/api/reports'&&req.method==='POST'){
    if(!limits(req,res,'reports',6,3600000))return;
    const b=await getBody(req),id=owner(req);
    if(!pointOK(b.coords)||!['transito','obra','acidente','risco','radar'].includes(b.type))return err(res,400,'Dados da ocorrência inválidos.');
    if(!listCap(db.reports,id,40))return err(res,429,'Limite de relatos desta conta atingido.');
    const record={id:hex(8),type:b.type,description:cleanText(b.description,280),coords:b.coords,createdAt:stamp(),status:'nao_verificado',owner:id};
    db.reports.push(record);await persist();return json(res,201,reportPublic(record));
  }
  if(pathname==='/api/routines'&&req.method==='POST'){
    if(!limits(req,res,'writes',90,60000))return;
    const b=await getBody(req),id=owner(req);
    if(!cleanText(b.name,80)||!cleanText(b.destination,80)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time||''))return err(res,400,'Rotina inválida.');
    if(!listCap(db.routines,id,50))return err(res,429,'Limite de rotinas atingido.');
    const item={id:hex(8),owner:id,name:cleanText(b.name,80),destination:cleanText(b.destination,80),time:b.time,createdAt:stamp()};db.routines.push(item);await persist();const {owner:_privateOwner,...publicRec}=item;return json(res,201,publicRec);
  }
  if(pathname.startsWith('/api/routines/')&&req.method==='DELETE'){
    const id=pathname.split('/').pop(),own=owner(req);db.routines=db.routines.filter(x=>!(x.id===id&&x.owner===own));await persist();return json(res,200,{ok:true});
  }
  if(pathname.startsWith('/api/admin'))return err(res,404,'Recurso administrativo não encontrado.');
  return err(res,404,'Rota não encontrada.');
}
const types={'.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer({maxHeaderSize:8192,requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
  try {
    if(process.env.VANO_SEO_INDEXABLE!=='1' || !production)res.setHeader('X-Robots-Tag','noindex, nofollow');
    const method=req.method||'GET';
    if(!['GET','POST','PATCH','DELETE','HEAD'].includes(method))return err(res,405,'Método não permitido.');
    if(!requestHTTPS(req,res))return;
    if(!limits(req,res,'all',240,60000))return;
    // Google OAuth legacy callback must reach the API controller, not the React SPA fallback.
    // Otherwise React redirects /login/google/callback to /inicio before a session is created.
    const requestPath=new URL(req.url||'/','http://localhost').pathname;
    if(requestPath.startsWith('/api/')||requestPath==='/login/google/callback'||requestPath==='/.well-known/vano-benchmark.json'){
      store.assertHealthy?.();runtimeMetrics.requests+=1;return await route(req,res);
    }
    if(!['GET','HEAD'].includes(method))return err(res,405,'Método não permitido.');
    const dist=path.join(root,'dist');
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(method==='GET'&&PUBLIC_PATHS.includes(name))runtimeMetrics.pageViews[name]=(runtimeMetrics.pageViews[name]||0)+1;
    if(name==='/')name='/index.html';
    let target=path.resolve(dist,'.'+name);
    // Pre-rendered guides have a folder index so crawlers receive real content before JavaScript.
    if(target.startsWith(dist+path.sep) && fs.existsSync(target) && fs.statSync(target).isDirectory())target=path.join(target,'index.html');
    if(!target.startsWith(dist+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile())target=path.join(dist,'index.html');
    if(!fs.existsSync(target)){res.writeHead(404,headers);return res.end('Frontend não compilado. Rode npm run build.');}
    const contentType=types[path.extname(target)]||'application/octet-stream';
    const privatePage=/^\/(admin|perfil|conta|entrar|cadastro|recuperar-senha|redefinir-senha|personalizar|atividade|favoritos|rotinas|configuracoes|relatar)(\/|$)/.test(name);
    res.writeHead(200,{...headers,'Content-Type':contentType,'Cache-Control':target.endsWith('index.html')?'no-cache':'public, max-age=3600',...(privatePage?{'X-Robots-Tag':'noindex, nofollow'}:{})});
    if(method==='HEAD')return res.end();
    fs.createReadStream(target).pipe(res);
  }catch(e){
    console.error('VANO HTTP error:',e instanceof HttpError?e.message:(e?.stack||String(e)));
    if(!res.headersSent)return err(res,e instanceof HttpError?e.status:500,e instanceof HttpError?e.message:'Erro interno do servidor.');
    res.end();
  }
});
const host=process.env.API_HOST||'127.0.0.1';
if(production && !['127.0.0.1','::1','localhost'].includes(host)) throw Error('O backend de produção deve ficar privado, acessível somente via proxy HTTPS.');
if(process.env.VANO_DISABLE_AUTOSTART!=='1')server.listen(port,host,()=>console.log(`VANO API: http://${host}:${port} (${production?'production':'development'})`));
export { server,search,directions };
