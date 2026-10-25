import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_VISIBLE_POIS,POI_CHOICES,PERMANENT_TYPES,sanitizePoiVisibility,personalizedPoiAllowed} from './mapPoiPreferences.mjs';

test('all requested configurable map POIs exist and no removed category is selectable',()=>{
 assert.equal(POI_CHOICES.length,15);
 const ids=POI_CHOICES.map(x=>x[0]);
 assert.deepEqual(ids,DEFAULT_VISIBLE_POIS);
 for(const k of ['farmacia','academia','estacionamento','combustivel','aeroporto','recarga','trem','pedagio']) assert.ok(ids.includes(k));
 for(const k of ['hotel','petshop','fastfood','lavarapido','terminal-onibus','rotatoria','parque','banco','semaforo']) assert.ok(!ids.includes(k));
});
test('clear all hides optional places but never traffic and permanent safety infrastructure',()=>{
 for(const x of ['farmacia','academia','combustivel','restaurante','shopping','estacionamento'])assert.equal(personalizedPoiAllowed(x,[]),false);
 for(const x of ['radar','semaforo','ferrovia','travessia','rotatoria','parque','banco']) {
  assert.ok(PERMANENT_TYPES.has(x));assert.equal(personalizedPoiAllowed(x,[]),true);
 }
});
test('selecting individual options maps provider feature types safely',()=>{
 assert.equal(personalizedPoiAllowed('farmacia',['farmacia']),true);
 assert.equal(personalizedPoiAllowed('academia',['farmacia']),false);
 assert.equal(personalizedPoiAllowed('estacao-recarga',['recarga']),true);
 assert.equal(personalizedPoiAllowed('estacao-trem',['trem']),true);
 assert.equal(personalizedPoiAllowed('hotel',DEFAULT_VISIBLE_POIS),false);
 assert.equal(personalizedPoiAllowed('petshop',DEFAULT_VISIBLE_POIS),false);
});
test('validate saved selection against the public POI whitelist',()=>{
 assert.deepEqual(sanitizePoiVisibility(['academia','hotel','farmacia','farmacia','banco']),['farmacia','academia']);
 assert.deepEqual(sanitizePoiVisibility([]),[]);
 assert.deepEqual(sanitizePoiVisibility(null),DEFAULT_VISIBLE_POIS);
});
