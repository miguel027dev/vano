# VANO Fluidez — Android WebView candidate

Version 2.7.0-fluidez-rc1, versionCode 27001, applicationId com.vano.maps.fluidez.
Separate installation for comparison with the Play app (com.vano.maps). This candidate does not update that app and its generated signing key is not the Play upload/app signing key.

Architecture: Android framework Activity + hardware-accelerated System WebView; remote HTTPS application at https://vanomaps.online/mobile/entry. Java host has no external Android UI dependencies. The server remains the source of interface, authentication, routes and Mapbox web code.

Implemented: preserve the WebView through rotations/configuration changes; correct system/keyboard insets; restore history after process recreation; renderer recovery; retryable connection errors; strict main-frame origin checks; no file access, cleartext or SSL-error bypass; first-party cookies; Android location permission handling including approximate location; Google login through external browser + server PKCE exchange; file picker; native share chooser; keep screen awake only for visible navigation; confirm exit during navigation.

Build:

```bash
ANDROID_SDK_ROOT=/absolute/android-sdk ./build.sh
```

Requires Java 17, Python 3, API 36 and build-tools 36.0.0. Output: build/VANO-Fluidez-2.7.0-rc1.apk. Build directory contains private candidate signing material and is excluded from git. No API secrets or signing material are embedded in the APK.

Validation completed: SDK compilation, D8 dex generation, zip alignment, v1/v2/v3 signature verification and APK manifest inspection. Web regression suite and behavior tests validate traffic scheduling and marker stability. These checks do not prove hardware FPS, working real-account OAuth, real GPS, audio or OEM compatibility.

Release gate: compare the same route on the current Play app and this candidate on physical basic/intermediate/high-end phones; test drag/zoom, keyboard, permissions denied/approximate, Google/password login, audio, sharing, orientation, pause/resume, offline/reconnect and 30-minute navigation. Require measured frame-time improvement without regressions before selecting WebView over the existing TWA. Keep the known-working production architecture if the candidate is slower.

A final AAB must retain the production applicationId, use a versionCode above the highest Play value, and use the correct existing upload key. Neither the current Play track nor that private key was verified in this session.
