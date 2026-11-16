import test from 'node:test';
import assert from 'node:assert/strict';
import {supportsNativeSingleGpsUserAgent} from './nativeShell.js';

test('new Android build explicitly announces native-only GPS and older AAB does not',()=>{
 assert.equal(supportsNativeSingleGpsUserAgent('Mozilla/5.0 VANOAndroid/3.1.5'),false);
 assert.equal(supportsNativeSingleGpsUserAgent('Mozilla/5.0 VANOAndroid/3.1.5 VANOAndroidSingleGPS/1'),true);
 assert.equal(supportsNativeSingleGpsUserAgent('Mozilla/5.0 VANOAndroidSingleGPS/1'),false);
 assert.equal(supportsNativeSingleGpsUserAgent('Mozilla/5.0 VANOAndroid/3.1.5 VANOAndroidSingleGPS/2'),false);
 assert.equal(supportsNativeSingleGpsUserAgent('Mozilla/5.0'),false);
});
