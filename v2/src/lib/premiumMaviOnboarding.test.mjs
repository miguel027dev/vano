import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const onboard=read('../pages/AuthPage.jsx');
const chat=read('../components/MaviSetupChat.jsx');
const account=read('../pages/SettingsPage.jsx');
const profile=read('../pages/ProfilePage.jsx');
const map=read('../pages/MapPage.jsx');
const server=read('../../server/index.mjs');
const moto=read('../../public/vehicle-moto-cutout.svg');

test('onboarding replaces artificial MAVI chat with explicit editable map preferences',()=>{
 assert.match(onboard,/const total=2/);
 assert.match(onboard,/import PersonalizationChoices from/);
 assert.match(onboard,/step===2&&<PersonalizationChoices/);
 assert.doesNotMatch(onboard,/step===2&&<MaviSetupChat/);
 assert.doesNotMatch(onboard,/O que faz parte do seu dia\?/);
 assert.doesNotMatch(onboard,/setup-tags/);
 assert.match(onboard,/vehicle-moto-cutout\.svg/);
 assert.match(moto,/<svg[^>]*viewBox/);
 assert.doesNotMatch(moto,/<rect[^>]*width="900"/);
});

test('MAVI asks only actionable routing questions and never requests precise location or hidden sensitive data',()=>{
 for(const text of ['route','tolls','alerts','playMaviVoice','/v2/onboarding/voice-ticket'])assert.ok(chat.includes(text),text);
 assert.match(chat,/Sem pedir sua localização\./);
 assert.match(chat,/voiceRequest\.current\?\.abort\(\)/);
 assert.match(chat,/onChange\(current\.id,value\)/);
});

test('user opt-in speech is restricted to fixed server phrases and uses the same private MAVI provider as the map',()=>{
 assert.match(server,/pathname==='\/api\/v2\/onboarding\/voice-ticket'/);
 assert.match(server,/if\(!protectedWrite\(req,res\)\)return/);
 assert.match(server,/const ticketType=eleven\.enabled\?'mavi-eleven-tts':cartesia\.enabled\?'mavi-cartesia-tts':null/);
 assert.match(server,/Object\.hasOwn\(phrases,stage\)/);
 assert.match(server,/type:ticketType,user:id/);
 assert.match(chat,/onClick=\{speaking\?/);
});

test('onboarding choices persist in user preferences, real initial routing and reroutes',()=>{
 assert.match(onboard,/avoidTolls:settings\.tolls/);
 assert.match(onboard,/alerts:settings\.alerts/);
 assert.match(server,/if\(p\.avoidTolls!==undefined\)/);
 assert.match(server,/typeof p\.avoidTolls!=='boolean'/);
 assert.match(map,/avoidTolls:preferences\?\.avoidTolls===true/);
 assert.match(account,/Preferência de pedágios/);
});

test('account and profile preserve existing security controls and action paths',()=>{
 for(const frag of ["patch('/profile'","api('/profile/export')","remove('/profile'","/api/auth/google/start?link=1","/api/auth/google/start?delete=1"])assert.ok(account.includes(frag),frag);
 assert.match(account,/aria-label="Confirmar exclusão de conta"/);
 assert.match(profile,/catch\(error\)\{setToast\(error\?\.message/);
 assert.match(profile,/to="\/conta"/);
 assert.match(profile,/to="\/personalizar"/);
});
