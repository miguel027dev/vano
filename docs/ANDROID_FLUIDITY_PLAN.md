# VANO Android fluidity: implementation and release gates

Date: 2026-10-08. Starting web commit a00717249b4799c517d19ab5041bcff0e62166d4.

## Plan and completed work

1. Identify architecture/builds: retrieved original 2.6.1 AAB (TWA, production package com.vano.maps); native repository is a separate MapLibre/Compose prototype. Do not assume that either identifies the active Play track or the user's installed APK.
2. Fix observed code costs: remove traffic scans triggered on every move; delay scans until camera movement settles; pause decorative route paint updates while moving/hidden/in eco mode; animate camera/puck at a 16 ms cadence for normal/high tiers; filter HTML markers to visible map bounds; do not reassign unchanged positions; throttle internal-camera overlay work to 500 ms; do not delete markers during transient style/source loading; stop animation timers while hidden and restore on return; avoid backdrop sampling during user gestures; disable MSAA on this WebView and low-power devices.
3. Prevent replay of the mobile Google login code using the existing atomic, database-backed OAuth state consumption (no schema migration); validate rejected PKCE does not consume valid login codes. Produce a separate signed WebView candidate using the live server and existing mobile PKCE authentication. Source and build script are in android-webview.
4. Validate before rollout: behavior tests + full existing web suite, compile/dex/package/signature checks. Real-device performance, OAuth, GPS and navigation are still release gates, not completed evidence.
5. Deploy only the reviewed web patch, retaining the original TWA/Play application. Final AAB selection depends on physical-device comparison and existing upload signing identity.

## Success/failure decisions

- Web patch improves Chrome and WebView: retain patch; compare APK vs TWA on equal hardware.
- Chrome/TWA remains smoother: launch existing TWA architecture with optimized site; avoid a WebView migration purely for branding.
- WebView wins and passes functional checks: prepare production package with confirmed signing key/versionCode.
- Slow only with navigation: profile camera/GPS, custom 3D puck and overlays before changing rendering technology.
- New regression: revert this commit's web changes; retain original known-working build.

Do not claim absence of all bugs, 60 FPS on all devices or native-equivalent performance from compilation/tests alone.
