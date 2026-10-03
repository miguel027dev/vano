from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
css_path=ROOT/"static"/"vano.css"
css=css_path.read_text(encoding="utf-8")

replacements={
    "body.vano-route-onboarding.is-launching .ob500-shell":".vano-onboarding-v500.is-launching .ob500-shell",
    "body.vano-route-onboarding .ob500-map-card:has(input:checked),\nbody.vano-route-onboarding .ob500-route-card:has(input:checked),\nbody.vano-route-onboarding .ob500-language:has(input:checked),\nbody.vano-route-onboarding .ob500-choice:has(input:checked){":"body.vano-route-onboarding .ob500-map-card.is-selected,\nbody.vano-route-onboarding .ob500-route-card.is-selected,\nbody.vano-route-onboarding .ob500-language.is-selected,\nbody.vano-route-onboarding .ob500-choice.is-selected{",
    'body.vano-route-profile [data-save-state="saving"] .profile350-savebar':'body.vano-route-profile [data-profile-root][data-save-state="saving"] .profile350-savebar',
}
for old,new in replacements.items():
    if old not in css:
        raise SystemExit(f"missing CSS target: {old[:80]}")
    css=css.replace(old,new,1)

old_reduce="""@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    scroll-behavior:auto!important;
    animation-duration:.001ms!important;
    animation-iteration-count:1!important;
    transition-duration:.001ms!important;
  }
  .ob500-launch-screen,.vano-entry-splash{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
  body.vano-route-profile .profile350-reveal{opacity:1!important;transform:none!important}
}"""
new_reduce="""@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto!important}
  .vano-x-pop-in,.vano-x-fade-in,.is-motion-selected,.is-motion-soft,.is-motion-pop,
  .ob500-launch-mark .ring,.ob500-launch-track i,.vano-entry-splash-mark i,
  .vano-entry-splash-track i,.vano-entry-splash.is-handoff .vano-entry-splash-mark img,
  body[data-nav-camera-state="RECENTERING"] #navFollowToggle,
  body[data-nav-camera-state="RECENTERING"] #navRecenter,
  body[data-nav-camera-state="RECENTERING"] #recenterBtn,
  .vano-x-route-enter .vr-hero,.vano-x-route-enter .vano-primary-transport-row,
  .vano-x-route-enter .route-variants,.vano-x-route-enter .start-trip-cta{
    animation:none!important
  }
  .ob500-launch-screen,.vano-entry-splash{
    backdrop-filter:none!important;
    -webkit-backdrop-filter:none!important;
    transition:none!important
  }
  body.vano-route-onboarding .ob500-form [data-ob-step],
  body.vano-route-profile .profile350-reveal{
    transition:none!important;
    transform:none!important;
    filter:none!important
  }
  body.vano-route-profile .profile350-reveal{opacity:1!important}
}"""
if old_reduce not in css:
    raise SystemExit("reduced-motion block not found")
css=css.replace(old_reduce,new_reduce,1)
css_path.write_text(css,encoding="utf-8")

test_path=ROOT/"tests"/"test_frontend_performance.py"
tests=test_path.read_text(encoding="utf-8")
needle='    assert "fitEndpoints()" in map_js\n'
extra='''    assert "$$(\\'.ob500-launch-screen\\')" in onboarding
    assert "document.body.appendChild(splash)" in map_js
    assert ".vano-onboarding-v500.is-launching .ob500-shell" in css
    assert ".ob500-map-card.is-selected" in css
    assert '[data-profile-root][data-save-state="saving"]' in css
    assert "*::before,*::after" not in css.split("/* VANO EXPERIENCE REFINEMENT",1)[1]
'''
if needle not in tests:
    raise SystemExit("test contract anchor missing")
if 'document.body.appendChild(splash)' not in tests:
    tests=tests.replace(needle,needle+extra,1)
test_path.write_text(tests,encoding="utf-8")

(ROOT/".github"/"workflows"/"experience-fix.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
