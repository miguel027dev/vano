import test from 'node:test';
import assert from 'node:assert/strict';
import {getLocaleSuggestion,localeForCountry,normalizeLocale} from './locale.mjs';

test('França e Portugal têm idioma regional sem geolocalização GPS',()=>{
  assert.equal(localeForCountry('FR'),'fr-FR');
  assert.equal(localeForCountry('PT'),'pt-PT');
  assert.equal(localeForCountry('BR'),'pt-BR');
});
test('País do proxy confiável prevalece sobre o idioma do navegador',()=>{
  assert.deepEqual(getLocaleSuggestion({'cf-ipcountry':'FR','accept-language':'pt-BR,pt;q=0.9'},true),{country:'FR',language:'fr-FR',source:'country'});
  assert.deepEqual(getLocaleSuggestion({'cf-ipcountry':'PT','accept-language':'fr-FR,fr;q=0.9'},true),{country:'PT',language:'pt-PT',source:'country'});
});
test('Geo headers não confiáveis são ignorados; browser é alternativa',()=>{
  assert.deepEqual(getLocaleSuggestion({'cf-ipcountry':'FR','accept-language':'pt-PT,pt;q=0.8'},false),{country:null,language:'pt-PT',source:'browser'});
  assert.equal(normalizeLocale('fr-CA'),'fr-FR');
  assert.equal(normalizeLocale('pt-PT'),'pt-PT');
  assert.equal(normalizeLocale('de-DE'),null);
});
