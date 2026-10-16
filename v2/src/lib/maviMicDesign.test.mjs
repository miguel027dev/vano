import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ICON_THEME,iconSvg} from './mapPublicIcons.js';
const mic=()=>readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
const css=()=>readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');
test('market and supermarket use separate balanced store/basket geometry',()=>{
 assert.deepEqual(ICON_THEME.mercado,['market','#2E9B63']);
 assert.deepEqual(ICON_THEME.supermercado,['basket','#3979BC']);
 const shop=iconSvg('mercado'),basket=iconSvg('supermercado');
 assert.match(shop,/M3\.5 10h17/);
 assert.match(shop,/M9 21v-6h6v6/);
 assert.match(basket,/M4 11h16/);
 assert.match(basket,/m8 11 4-7 4 7/);
 assert.ok(!shop.includes('<script')&&!basket.includes('<script'));
 assert.match(shop,/viewBox="0 0 24 24"/);
 assert.match(basket,/viewBox="0 0 24 24"/);
});
test('MAVI mic has accessible visual phases with one click toggle',()=>{
 const jsx=mic(),skin=css();
 assert.match(jsx,/voicePhase=!enabled\?'off'/);
 for(const state of ['off','ready','listening','processing','speaking','paused']){
  assert.match(jsx,new RegExp(state==='off'?"off:'Ativar escuta":state+":"));
  assert.match(skin,new RegExp('mavi-voice-'+state));
 }
 assert.match(jsx,/onClick=\{toggle\}/);
 assert.match(jsx,/aria-pressed=\{enabled\}/);
 assert.match(jsx,/aria-live="polite"/);
 assert.match(jsx,/mavi-mic-indicator/);
 assert.match(skin,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(skin,/focus-visible/);
});
test('silence does not disable listening; speech is gated until response playback completes',()=>{
 const jsx=mic();
 assert.match(jsx,/if\(code==='no-speech'\)\{/);
 assert.match(jsx,/recognitionError\.current='';/);
 assert.match(jsx,/setStatus\('ready'\);\s*return;/);
 assert.match(jsx,/maviRecognitionRecovery\(\{/);
 assert.match(jsx,/scheduleNextListen\(recovery\.delay\)/);
 assert.match(jsx,/if\(navigationAudioActive\(\)\|\|window\.speechSynthesis\?\.speaking\)\{scheduleNextListen\(1100\);return;\}/);
 assert.match(jsx,/if\(!enabledRef\.current\|\|busyRef\.current\|\|recognitionError\.current\|\|!Recognizer\)return/);
 assert.match(jsx,/if\(finished\|\|!enabledRef\.current\|\|controller\.signal\.aborted\)return/);
 assert.match(jsx,/done\(\);\s*\/\/ Offer controls are revealed/);
 assert.doesNotMatch(jsx,/setTimeout\(\(\)=>\s*\{\s*recognition\.start\(\)/);
});
