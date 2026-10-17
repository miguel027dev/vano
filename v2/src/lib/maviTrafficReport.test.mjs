import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMaviTrafficReport} from './maviTrafficReport.mjs';
import {readFileSync} from 'node:fs';
import {reportIconSvg} from './communityReports.js';
test('local Portuguese voice observations create traffic report intent',()=>{
 for(const speech of [
  'MAVI, tá tendo trânsito aqui nessa rua!',
  'Ô Mavi, tá tendo muito trânsito aqui. Faz uma ocorrência.',
  'Mavi, ta muito transito aqui',
  'Mavi tem muito trânsito nessa rua',
  'Mavi estou pegando engarrafamento aqui',
  'Mavi registra uma ocorrência de trânsito',
  'Mavi faz um alerta de congestionamento aqui'
 ])assert.equal(classifyMaviTrafficReport(speech),'transito',speech);
});
test('questions and ambiguous sentences never create a report',()=>{
 for(const speech of [
  'Mavi, como está o trânsito?',
  'Mavi tem trânsito na minha rota?',
  'Mavi, liga o trânsito no mapa',
  'Mavi mostra o trânsito',
  'Mavi, está previsto trânsito amanhã?',
  'Mavi, qual a situação do trânsito aqui?',
  'Mavi, não tem trânsito aqui',
  'Mavi, sem trânsito aqui',
  'Mavi ta tendo transito la no centro',
  'Mavi acidente aqui, registra uma ocorrência',
  'Mavi tem blitz aqui'
 ])assert.equal(classifyMaviTrafficReport(speech),null,speech);
});
test('no remote or malformed payload is accepted for traffic reporting',()=>{
 assert.equal(classifyMaviTrafficReport(null),null);
 assert.equal(classifyMaviTrafficReport('x'.repeat(400)),null);
});

test('new traffic icon is two minimal recognizable cars; blitz glyph unchanged',()=>{
 const traffic=reportIconSvg('transito');
 const police=reportIconSvg('fiscalizacao');
 assert.match(traffic,/M7 6\.6 8 4/);
 assert.match(traffic,/M4 17h16v4/);
 assert.match(police,/M12 3 4\.5 6v6/);
 assert.doesNotMatch(traffic,/stroke-width="3"/);
});
test('MAVI submits GPS-backed traffic to existing reports pipeline before network assistant',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
 assert.match(page,/classifyMaviTrafficReport\(text\)==='transito'/);
 assert.match(page,/await report\(\{type:'transito',coords:gps\.coords,description:''\}\)/);
 assert.match(page,/const gps=quickReportPosition\(fix\)/);
 assert.match(page,/guard\.pending=true/);
 assert.match(page,/await report[\s\S]*?return \{mode:'information',text:message/);
 assert.match(server,/Pronto\. Registrei o trânsito aqui para a comunidade\./);
 assert.match(server,/reportStreams\.publish\(record\)/);
});
