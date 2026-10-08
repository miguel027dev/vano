"""Regressions for the isolated Android-installed route HUD and WebView candidate."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def read(path):return (ROOT/path).read_text(encoding="utf-8")

def test_android_layout_is_opt_in_not_applied_to_desktop_site():
    html=read("templates/index.html")
    js=read("static/vano-android-nav-layout.js")
    css=read("static/vano-foundation.css")
    assert "vano-android-nav-layout.js" in html
    assert "VANOAndroid" in html
    assert "android-app:" in html
    assert "display-mode: standalone" in html
    assert "vano-android-shell" in html
    assert "if(!html.classList.contains('vano-android-shell'))return;" in js
    assert "html.vano-android-shell body.vano-map-surface" in css

def test_android_hud_never_absolutely_stacks_eta_or_crops_reports():
    css=read("static/vano-foundation.css")
    assert "VANO ANDROID NAVIGATION SHELL V721" in css
    assert "--vano-android-radar-top" in css
    assert "--vano-android-radar-cap" in css
    assert "--vano-android-context-top" in css
    assert "max-height:calc(100dvh - 16px)!important" in css
    assert "overflow-y:auto!important" in css
    assert ".quick-alert-grid" in css
    assert ".nav-summary-row" in css
    assert "grid-template-columns:repeat(3,minmax(0,1fr)) auto!important" in css
    assert ".traffic-suggestion.show" in css
    assert "max-height:calc(100dvh - 8px)!important" in css

def test_android_hud_layout_is_measured_on_state_and_inset_changes():
    js=read("static/vano-android-nav-layout.js")
    for contract in ("ResizeObserver","MutationObserver","visualViewport","requestAnimationFrame",
                     "navManeuverTop","navStreetChip","trafficRadar","navContextAlert","activeNav",
                     "orientationchange"):
        assert contract in js
    assert "setInterval" not in js

def test_android_host_does_not_propagate_applied_insets_to_webview():
    java=read("android-webview/src/com/vano/maps/fluidez/MainActivity.java")
    assert "Math.max(bars.bottom,keyboard.bottom)" in java
    assert "WindowInsets.CONSUMED" in java
    assert "VANOAndroid/2.7.1-navfix-rc2" in java

def test_route_camera_keeps_user_close_in_normal_gps_conditions():
    js=read("static/vano-map.js")
    assert "zoomBase:17.48,zoomMin:16.70" in js
    assert "zoomBase:17.56,zoomMin:16.75" in js
    assert "navCameraState!==NAV_CAMERA_STATES.REROUTING" in js
    assert "Math.max(0,+p.accuracy||0)<55" in js
    assert "cameraVisualState.center=[blendNumber" in js
    assert "NAV_OFF_ROUTE_MIN_TIME_MS=2200" in js

def test_apk_build_keeps_separate_package_from_play_production():
    manifest=read("android-webview/AndroidManifest.xml")
    workflow=read(".github/workflows/android-candidate.yml")
    assert 'package="com.vano.maps.fluidez"' in manifest
    assert 'android:versionCode="27002"' in manifest
    assert "upload-artifact@v4" in workflow
    assert "build/VANO-Fluidez-2.7.1-navfix-rc2.apk" in workflow
