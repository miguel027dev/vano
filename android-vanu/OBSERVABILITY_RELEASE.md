# Android analytics candidate 3.1.8 / 20270009 — NOT BUILT OR PUBLISHED

Base: `1b8d7344535eee2db55bda412dc0ef0eaa12c3d3`, matching the repository version 3.1.7 / 20270008
observed in Google Play production. Byte-for-byte provenance against the uploaded AAB remains unverified.

## Implementation

Firebase Analytics and Crashlytics use Firebase BoM 35.2.0, Google services plugin 4.6.0 and Crashlytics plugin 3.0.8.
These versions were taken from official Firebase documentation on 2026-11-16; Android compilation is still required.
Performance Monitoring is deferred until baseline startup/memory measurements and URL-data minimization can be validated.

Package, minSdk 24, targetSdk/compileSdk 36 and signing alias remain unchanged. Existing release signing uses
`VANO_UPLOAD_KEYSTORE` and `VANO_UPLOAD_PASSWORD_FILE`. The release preflight refuses missing original signing inputs.
No replacement key has been generated.

The only new bridge actions are `observabilityConsent` and `observabilityEvent`, accepted from the existing
origin-bound WebMessage channel, main frame only. They are never handled by the older prompt fallback.
No addJavascriptInterface, new origins, UI, maps, GPS providers or navigation algorithms were introduced.
Events are allowlisted; numeric measurements and enumerated kinds only. Automatic Firebase event names are rejected.
Incoming events have a 2 KiB limit, at most 120/minute, and a 256-entry in-process deduplication window.

Collection defaults OFF until an explicit user privacy choice reaches the bridge. Ads consent is denied,
advertising permission declarations are removed, automatic screen-name reporting is disabled and no user ID is set.
Merged-manifest permission verification remains pending. Do not claim full disclosure/compliance from source review alone.
Revocation stops uploads, resets Analytics and deletes unsent Crashlytics reports; previously uploaded data needs
an operator-supported erasure workflow. SDK-generated installation IDs are pseudonymous, not anonymous.

Native diagnostics cover main-frame communication/HTTP failures and WebView renderer loss (fixed error message, no URL).
The initial web-ready duration is collected only if enabled; it is not a measured cold-start benchmark.
A consented native crash would be handled by Crashlytics automatically, but delivery has not been tested.
Do not emit `first_open`, `session_start`, retention or user_engagement manually.

## External resources observed

- Firebase project: `vano-maps`, number `194011733049`, Spark.
- Android Firebase App ID: `1:194011733049:android:8256905680c01f9d8b81e8`.
- Package: `com.vano.maps`.
- GA4 account `241580348`, property `564452827`.
- BigQuery: daily Analytics plus Crashlytics and Firebase sessions export enabled in sandbox;
  configured region `southamerica-east1`; dataset creation/data delivery not observed yet.

## Blocking gates

1. `app/google-services.json` could not be transferred through this browser's download facility.
   Use the official file from this project; never fabricate the API key or create another Firebase app.
2. SDK installation stopped at the Android SDK license prompt; no acceptance was recorded.
3. Original upload keystore/password file are unavailable in this workspace. The connected device is offline.
4. DebugView, sessions, controlled crash, memory, startup, physical GPS and visual regression checks are unperformed.
5. Privacy policy, consent control and Play Data safety need review before collection can be activated.
6. The release build attempt stopped while downloading Gradle because Java could not reach the network directly.
   Configure the approved runtime proxy without committing its details before retrying.

## Tests

Pure Java allowlist/privacy test compiled and passed with JDK 17.
No Android compile, merged-manifest, signing, AAB validation or on-device test has passed in this session.
Do not request final publication approval until these release-critical gates pass.

## Required verification

Build debug and signed release; inspect merged permissions; check package/version and upload certificate against Play.
On a test device, set `adb shell setprop debug.firebase.analytics.app com.vano.maps`, grant analytics via an approved
privacy mechanism, then verify one event per action in DebugView. Disable debug mode afterwards using `.none.`.
Use a debug-only controlled crash and restart to verify delivery; never add a production crash button.
Measure startup, heap and frames against the published 3.1.7 on the same device and scenario.
Confirm map rendering, system bars, voice, real GPS, rerouting and user navigation remain unchanged.
Prepare an internal test before a production staged rollout. Explicit publication approval is still required.
