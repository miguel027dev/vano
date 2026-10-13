import test from 'node:test';
import assert from 'node:assert/strict';
import {MANEUVER_PATHS,MANEUVER_SECONDARY_PATHS,maneuverVariant,laneVariants,displayManeuverDistance,maneuverText} from './maneuverVisuals.js';

test('specific real provider maneuvers produce visually distinct, stable symbols', () => {
  const cases = [
    [{kind:'turn',modifier:'left'},'left'],
    [{kind:'turn',modifier:'right'},'right'],
    [{kind:'turn',modifier:'slight right'},'slight-right'],
    [{kind:'turn',modifier:'sharp-left'},'sharp-left'],
    [{kind:'turn',modifier:'uturn'},'uturn'],
    [{kind:'roundabout',modifier:'right'},'roundabout'],
    [{kind:'rotary',modifier:'left'},'roundabout'],
    [{kind:'exit roundabout',modifier:'right'},'roundabout'],
    [{kind:'fork',modifier:'left'},'fork-left'],
    [{kind:'off ramp',modifier:'right'},'ramp-right'],
    [{kind:'arrive',modifier:'straight'},'arrive'],
    [{kind:'turn',modifier:null},'straight'],
    [{kind:'unknown',modifier:'nonsense'},'straight'],
  ];
  for (const [source,expected] of cases) {
    const variant = maneuverVariant(source);
    assert.equal(variant,expected,JSON.stringify(source));
    assert.ok(MANEUVER_PATHS[variant]?.startsWith('M'),variant);
  }
  assert.equal(new Set(Object.values(MANEUVER_PATHS)).size,Object.keys(MANEUVER_PATHS).length);
  assert.ok(MANEUVER_PATHS.roundabout.includes('M35 22H43'));
  assert.ok(MANEUVER_SECONDARY_PATHS['fork-right']);
});

test('only real provider lane directions are rendered, including dual-direction lanes', () => {
  assert.deepEqual(laneVariants({indications:['straight','right']}),['straight','right']);
  assert.deepEqual(laneVariants({indications:['slight left','straight','right']}),['slight-left','straight']);
  assert.deepEqual(laneVariants({indications:['invalid','right','right']}),['right']);
  assert.deepEqual(laneVariants({indications:[]}),[]);
  assert.deepEqual(laneVariants(null),[]);
});

test('distance label is stable, localized and never fabricates missing meters', () => {
  assert.equal(displayManeuverDistance(null),'—');
  assert.equal(displayManeuverDistance(NaN),'—');
  assert.equal(displayManeuverDistance(-2),'—');
  assert.equal(displayManeuverDistance(5),'Agora');
  assert.equal(displayManeuverDistance(25),'25 m');
  assert.equal(displayManeuverDistance(1250),'1,3 km');
  assert.equal(displayManeuverDistance(1250,'en-US'),'1.3 km');
});

test('street is not duplicated when provider instruction already says it', () => {
  assert.deepEqual(maneuverText({instruction:'Vire à direita na Avenida Giovanni Gronchi',street:'Avenida Giovanni Gronchi'}),
    {instruction:'Vire à direita na Avenida Giovanni Gronchi',street:''});
  assert.deepEqual(maneuverText({instruction:'Vire à direita',street:'Rua do Lago'}),
    {instruction:'Vire à direita',street:'Rua do Lago'});
  assert.deepEqual(maneuverText(null),{instruction:'Continue pela rota',street:''});
});
