import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');

test('public root and legacy welcome URLs permanently redirect to /mapa',()=>{
  for(const path of ["requestPath==='/'","requestPath==='/inicio'","requestPath==='/inicio/'","requestPath==='/index.html'"]){
    assert.ok(server.includes(path),path);
  }
  assert.ok(server.includes('res.writeHead(301,'));
  assert.ok(server.includes("'Location':`/mapa${parsedRequestUrl.search}`"));
});

test('React navigation never displays the welcome page for entry URLs',()=>{
  assert.ok(app.includes('function InitialRoute(){return <Navigate to="/mapa" replace/>}'));
  assert.ok(app.includes('<Route path="/inicio" element={<Navigate to="/mapa" replace/>}/>'));
  assert.ok(!app.includes('<EntryPage/>'));
});
