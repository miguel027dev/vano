import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireNavigationAudioFocus,navigationAudioActive,onNavigationAudioStart} from './maviAudioFocus.mjs';
test('maneuver audio takes precedence and releases focus even after cancellation',()=>{
 let interruptions=0;const unsubscribe=onNavigationAudioStart(()=>interruptions++);
 const release=acquireNavigationAudioFocus();
 assert.equal(navigationAudioActive(),true);assert.equal(interruptions,1);
 const releaseAgain=acquireNavigationAudioFocus();
 assert.equal(interruptions,1,'rapid replacement of a turn cannot send redundant interruptions');
 releaseAgain();assert.equal(navigationAudioActive(),true);
 release();release();assert.equal(navigationAudioActive(),false);
 unsubscribe();
 const after=acquireNavigationAudioFocus();assert.equal(interruptions,1);
 after();assert.equal(navigationAudioActive(),false);
});
