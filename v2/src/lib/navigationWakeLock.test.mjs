import test from 'node:test';
import assert from 'node:assert/strict';
import { startNavigationWakeLock } from './navigationWakeLock.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(requestOverride) {
  const documentObject = new EventTarget();
  documentObject.visibilityState = 'visible';
  const windowObject = new EventTarget();
  const locks = [];
  let requests = 0;
  const navigatorObject = { wakeLock: { request: async type => {
    assert.equal(type, 'screen');
    requests += 1;
    if (requestOverride) return requestOverride(type);
    const lock = new EventTarget();
    lock.released = false;
    lock.release = async () => {
      if (!lock.released) {
        lock.released = true;
        lock.dispatchEvent(new Event('release'));
      }
    };
    locks.push(lock);
    return lock;
  }}};
  return { documentObject, windowObject, navigatorObject, locks, get requests() {return requests;} };
}

test('acquires during navigation and releases on stop', async () => {
  const h = harness();
  const stop = startNavigationWakeLock(h);
  await flush();
  assert.equal(h.requests, 1);
  assert.equal(h.locks[0].released, false);
  stop();
  await flush();
  assert.equal(h.locks[0].released, true);
  h.windowObject.dispatchEvent(new Event('focus'));
  await flush();
  assert.equal(h.requests, 1);
});

test('releases on hidden tab and reacquires on return', async () => {
  const h = harness();
  const stop = startNavigationWakeLock(h);
  await flush();
  h.documentObject.visibilityState = 'hidden';
  h.documentObject.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(h.locks[0].released, true);
  h.documentObject.visibilityState = 'visible';
  h.documentObject.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(h.requests, 2);
  assert.equal(h.locks[1].released, false);
  stop();
});

test('unavailable or denied wake lock does not crash', async () => {
  const h = harness();
  assert.doesNotThrow(() => startNavigationWakeLock({...h,navigatorObject:{}})());
  const denied = harness(async () => {throw Error('NotAllowedError')});
  const stop = startNavigationWakeLock(denied);
  await flush();
  assert.equal(denied.requests, 1);
  stop();
});

test('a pending request releases the lock after navigation ends', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness(async () => pending);
  const stop = startNavigationWakeLock(h);
  stop();
  const lock = new EventTarget();
  lock.released = false;
  lock.release = async () => { lock.released = true; };
  finish(lock);
  await flush();
  assert.equal(lock.released, true);
});
