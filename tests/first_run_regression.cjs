'use strict';

// Isolated behavior regressions for the VANO first-run flow.
// Uses the repository source, not a duplicate of the production functions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const onboarding = fs.readFileSync('static/vano-onboarding.js', 'utf8');
const map = fs.readFileSync('static/vano-map.js', 'utf8');

function extract(source, start, next) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Missing source function: ${start}`);
  const end = source.indexOf(next, from + start.length);
  assert.ok(end > from, `Missing boundary after: ${start}`);
  return source.slice(from, end);
}

const clearSource = extract(onboarding, 'function clearErrors(){', 'function invalidate(');
const validateSource = extract(onboarding, 'function validateStep(', 'function updateProfile(');

function sampleNode() {
  const removedClasses = [], removedAttributes = [];
  let removalCount = 0;
  return {
    removedClasses, removedAttributes,
    classList: { remove(name) { removedClasses.push(name); } },
    removeAttribute(name) { removedAttributes.push(name); },
    remove() { removalCount++; },
    get removalCount() { return removalCount; },
  };
}

const invalidNodes = [sampleNode(), sampleNode()];
const flaggedNodes = [sampleNode(), sampleNode()];
const inlineNodes = [sampleNode(), sampleNode()];
const lookup = {
  '.ob-invalid-v340': invalidNodes,
  '[aria-invalid="true"]': flaggedNodes,
  '.ob-inline-error-v340': inlineNodes,
};
const state = {
  form: {},
  $$: selector => lookup[selector] || [],
  name: { value: 'Miguel' },
  age: { value: '16' },
  sexInputs: [{ checked: true, value: 'prefer_not_say' }],
  routeInputs: [{ checked: true, value: 'balanced' }],
  mapInputs: [{ checked: true, value: 'auto' }],
  localeInputs: [{ checked: true, value: 'pt-BR' }],
  selected: inputs => inputs.find(x => x.checked)?.value || '',
  invalidate: () => { throw new Error('Valid form should not be invalidated'); },
};
vm.createContext(state);
vm.runInContext(clearSource + '\n' + validateSource, state);
assert.equal(vm.runInContext('validateStep(1)', state), true, 'valid first step should advance');
assert.equal(vm.runInContext('validateStep(2)', state), true, 'valid preferences should advance');
assert.equal(vm.runInContext('validateStep(3)', state), true, 'valid language should advance');
invalidNodes.forEach(x => assert.deepEqual(x.removedClasses, ['ob-invalid-v340', 'ob-invalid-v340', 'ob-invalid-v340']));
flaggedNodes.forEach(x => assert.deepEqual(x.removedAttributes, ['aria-invalid', 'aria-invalid', 'aria-invalid']));
inlineNodes.forEach(x => assert.equal(x.removalCount, 3));

// Repeated clearing and an empty form must not throw (old querySelector/forEach bug).
for (const key of Object.keys(lookup)) lookup[key] = [];
assert.doesNotThrow(() => vm.runInContext('clearErrors()', state));
assert.doesNotThrow(() => vm.runInContext('validateStep(1)', state));

const guardSource = extract(map, 'function requireRouteAccount(){', 'function syncRouteProfileUi(');
function assertGuestGuard(loggedIn, remaining, expectedAccess, expectedModalCount) {
  let modalCount = 0;
  const sandbox = {
    LOGGED_IN: loggedIn,
    guestRoutesRemaining: remaining,
    showGuestLimit: () => modalCount++,
    location: { assign: () => { throw new Error('Route choice unexpectedly redirected to login'); } },
    LOGIN_URL: '/login',
  };
  vm.createContext(sandbox);
  vm.runInContext(guardSource, sandbox);
  assert.equal(vm.runInContext('requireRouteAccount()', sandbox), expectedAccess);
  assert.equal(modalCount, expectedModalCount);
}
assertGuestGuard(true, 0, true, 0);
assertGuestGuard(false, 10, true, 0);
assertGuestGuard(false, 1, true, 0);
assertGuestGuard(false, 0, false, 1);
assert.match(map, /\[data-route-mode\][\s\S]*?requireRouteAccount\(\)/);
assert.match(map, /\[data-profile\][\s\S]*?requireRouteAccount\(\)/);

console.log('PASS: onboarding validation state and guest-route selection regressions');
