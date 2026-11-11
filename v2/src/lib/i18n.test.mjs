import test from 'node:test';
import assert from 'node:assert/strict';
import {inferBrowserLocale,localeForCountry,normalizeLocale,translate} from './i18n.js';

test('Fuso horário permite inferir França e Portugal sem pedir GPS',()=>{
  assert.equal(inferBrowserLocale({languages:['pt-BR'],timeZone:'Europe/Paris'}),'fr-FR');
  assert.equal(inferBrowserLocale({languages:['fr-FR'],timeZone:'Europe/Lisbon'}),'pt-PT');
  assert.equal(inferBrowserLocale({languages:['pt-BR'],timeZone:'America/Sao_Paulo'}),'pt-BR');
});
test('País explicitamente conhecido e idioma do navegador têm fallback',()=>{
  assert.equal(localeForCountry('FR'),'fr-FR');
  assert.equal(normalizeLocale('pt-PT'),'pt-PT');
  assert.equal(inferBrowserLocale({languages:['fr-FR'],timeZone:'Unknown/None'}),'fr-FR');
  assert.equal(inferBrowserLocale({languages:['zh-CN'],timeZone:'Unknown/None'}),'en-US');
});
test('Traduções das telas de cadastro e escolha de rota',()=>{
  assert.equal(translate('Criar conta','fr-FR'),'Créer un compte');
  assert.equal(translate('Senha','pt-PT'),'Palavra-passe');
  assert.equal(translate('Mais segura','fr-FR'),'Plus sûre');
  assert.equal(translate('Mais rápida','en-US'),'Faster route');
});
