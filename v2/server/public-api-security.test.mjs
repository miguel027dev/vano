import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {secureHeaders} from './security.mjs';
import {parseBenchmarkParams,benchmarkCapabilities} from './benchmark.mjs';
const api=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
const benchmark='start_lat=-23.6223&start_lon=-46.6987&end_lat=-23.5615&end_lon=-46.6557';

test('public Mapbox pk URL restriction can receive the referrer origin without URL path',()=>{
 const headers=secureHeaders(true);
 assert.equal(headers['Referrer-Policy'],'strict-origin-when-cross-origin');
 assert.ok(headers['Content-Security-Policy'].includes('https://api.mapbox.com'));
});
test('health endpoint returns only uptime boolean and private admin dashboard retains diagnostics',()=>{
 const health=api.match(/if \(pathname === '\/api\/health'[^\n]+/);
 assert.ok(health);
 assert.match(health[0],/json\(res,200,\{ok:true\}\)/);
 assert.doesNotMatch(health[0],/DATABASE_URL|PostgreSQL|storage|persistentDb|googleIssue|googleReady|mapboxConfigured/);
 assert.match(api,/adminMetrics\(db,runtimeMetrics/);
});
test('anonymous public benchmarks cannot trigger twenty traffic-corridor probes',()=>{
 const code=api.slice(api.indexOf("if(pathname==='/api/benchmark/v1/route'"),
  api.indexOf("if(pathname==='/api/transit/capabilities'"));
 assert.match(code,/skipCandidateProbes:true/);
 assert.match(code,/adaptive:false/);
 assert.match(code,/limiter\('public-benchmark:instance',24,60000\)/);
 const denied=parseBenchmarkParams(new URLSearchParams(benchmark+'&adaptive=1'));
 assert.equal(denied.error,'public_adaptive_disabled');
 assert.equal(parseBenchmarkParams(new URLSearchParams(benchmark+'&variant_budget=4')).status,400);
 const caps=benchmarkCapabilities();
 assert.equal(caps.limits.maxVariantBudget,2);
});
test('favorite DELETE requires the global session/CSRF guard and matching owner before a write',()=>{
 assert.match(api,/if \(req.method !== 'GET' && !protectedWrite\(req,res\)\) return/);
 const code=api.slice(api.indexOf("if(pathname.startsWith('/api/favorites/')"),
  api.indexOf("if(pathname==='/api/history'",api.indexOf("if(pathname.startsWith('/api/favorites/')")));
 assert.match(code,/limits\(req,res,'favorites-delete',20,60000\)/);
 assert.match(code,/findIndex\(x=>x.id===id&&x.owner===own\)/);
 assert.match(code,/if\(at===-1\)return err\(res,404/);
 assert.ok(code.indexOf('if(at===-1)')<code.indexOf('await persist()'));
 assert.doesNotMatch(code,/db\.favorites=db\.favorites\.filter/);
});
test('account uses separated server token when available without exposing secrets in Vite env',()=>{
 assert.match(api,/VANO_REQUIRE_MAPBOX_SERVER_TOKEN==='1'/);
 assert.match(api,/!process\.env\.MAPBOX_SECRET_TOKEN/);
 assert.match(api,/process\.env\.MAPBOX_SECRET_TOKEN \|\| process\.env\.VITE_MAPBOX_PUBLIC_TOKEN/);
});
