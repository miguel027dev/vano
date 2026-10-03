from pathlib import Path

root=Path(__file__).resolve().parents[1]
css_path=root/"static"/"vano.css"
css=css_path.read_text(encoding="utf-8")
marker="/* VANO EXPERIENCE MOTION REFINEMENT 2026-10-03 */"
if marker not in css:
    css += r'''

/* VANO EXPERIENCE MOTION REFINEMENT 2026-10-03 */
:root{
  --vano-motion-fast:140ms;
  --vano-motion-base:220ms;
  --vano-motion-slow:420ms;
  --vano-motion-ease:cubic-bezier(.22,.76,.24,1);
  --vano-motion-spring:cubic-bezier(.16,1,.3,1);
}

/* Shared tactile motion */
.vano-app-root button,
.vano-app-root a,
.vano-app-root input,
.vano-app-root select,
.vano-app-root textarea,
.vano-auth-startup button,
.vano-auth-startup a{
  -webkit-tap-highlight-color:transparent;
}
.vano-app-root button:not(:disabled),
.vano-app-root a,
.vano-auth-startup button:not(:disabled),
.vano-auth-startup a{
  transition:
    transform var(--vano-motion-fast) var(--vano-motion-ease),
    box-shadow var(--vano-motion-base) var(--vano-motion-ease),
    border-color var(--vano-motion-base) ease,
    background-color var(--vano-motion-base) ease,
    color var(--vano-motion-base) ease,
    opacity var(--vano-motion-base) ease;
}
.vano-app-root button:not(:disabled):active,
.vano-auth-startup button:not(:disabled):active{
  transform:scale(.975);
}

/* Onboarding step transitions */
body.vano-route-onboarding [data-ob-step]{
  transform-origin:50% 18%;
}
body.vano-route-onboarding [data-ob-step].is-active{
  animation:vano-ob-step-in 380ms var(--vano-motion-spring) both;
}
body.vano-route-onboarding [data-ob-step].is-active.is-back{
  animation-name:vano-ob-step-back;
}
@keyframes vano-ob-step-in{
  from{opacity:0;transform:translate3d(18px,8px,0) scale(.992);filter:blur(3px)}
  to{opacity:1;transform:none;filter:none}
}
@keyframes vano-ob-step-back{
  from{opacity:0;transform:translate3d(-18px,8px,0) scale(.992);filter:blur(3px)}
  to{opacity:1;transform:none;filter:none}
}
body.vano-route-onboarding .is-motion-selected,
body.vano-route-onboarding .is-picked{
  animation:vano-choice-pop 340ms var(--vano-motion-spring);
}
@keyframes vano-choice-pop{
  0%{transform:scale(.985)}
  58%{transform:scale(1.018)}
  100%{transform:scale(1)}
}

/* Post-onboarding handoff */
.ob500-launch-screen{
  position:fixed;
  inset:0;
  z-index:99999;
  display:grid;
  place-items:center;
  padding:24px;
  opacity:0;
  visibility:hidden;
  background:
    radial-gradient(circle at 50% 42%,rgba(245,154,98,.16),transparent 28rem),
    rgba(8,9,11,.94);
  backdrop-filter:blur(18px) saturate(120%);
  transition:opacity 360ms ease,visibility 360ms ease;
}
.ob500-launch-screen.is-visible{opacity:1;visibility:visible}
.ob500-launch-screen>.ring{
  position:absolute;
  left:50%;
  top:50%;
  width:260px;
  height:260px;
  margin:-130px;
  border:1px solid rgba(245,154,98,.12);
  border-radius:50%;
  animation:vano-launch-ring 1.8s ease-out infinite;
  pointer-events:none;
}
.ob500-launch-screen>.ring.r2{animation-delay:.34s}
.ob500-launch-screen>.ring.r3{animation-delay:.68s}
@keyframes vano-launch-ring{
  0%{transform:scale(.72);opacity:.72}
  100%{transform:scale(1.45);opacity:0}
}
.ob500-launch-core{
  position:relative;
  z-index:2;
  width:min(390px,calc(100vw - 40px));
  padding:28px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:28px;
  background:rgba(17,18,21,.84);
  box-shadow:0 30px 100px rgba(0,0,0,.45);
  transform:translateY(14px) scale(.97);
  opacity:0;
  transition:transform 520ms var(--vano-motion-spring),opacity 360ms ease;
}
.ob500-launch-screen.is-visible .ob500-launch-core{transform:none;opacity:1}
.ob500-launch-brand{display:flex;align-items:center;gap:12px}
.ob500-launch-brand img{width:44px;height:44px;border-radius:13px}
.ob500-launch-brand span{display:grid;gap:2px}
.ob500-launch-brand b{font-size:15px;letter-spacing:-.2px;color:#fff}
.ob500-launch-brand small{font-size:8px;letter-spacing:.14em;color:#8b919b}
.ob500-launch-route{
  position:relative;
  height:104px;
  margin:18px 0 12px;
  overflow:hidden;
  border-radius:20px;
  background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.008));
}
.ob500-launch-route>i{
  position:absolute;
  left:15%;
  right:15%;
  top:50%;
  height:2px;
  border-radius:99px;
  background:linear-gradient(90deg,transparent,#f59a62 22%,#ffc39b 72%,transparent);
  opacity:.72;
}
.ob500-launch-route>i:nth-child(2){top:64%;left:24%;right:8%;opacity:.24;transform:rotate(-8deg)}
.ob500-launch-route>span{
  position:absolute;
  left:20%;
  top:50%;
  display:grid;
  place-items:center;
  width:48px;
  height:48px;
  margin-top:-24px;
  border-radius:50%;
  color:#151515;
  background:linear-gradient(145deg,#ffc39b,#f59a62);
  box-shadow:0 0 0 7px rgba(245,154,98,.10),0 12px 30px rgba(0,0,0,.32);
  animation:vano-launch-drive 760ms var(--vano-motion-spring) both;
}
@keyframes vano-launch-drive{
  from{left:13%;transform:scale(.82) rotate(-12deg);opacity:.2}
  to{left:69%;transform:scale(1) rotate(8deg);opacity:1}
}
.ob500-launch-core>strong{display:block;color:#fff;font-size:20px;letter-spacing:-.6px}
.ob500-launch-core>p{margin:6px 0 18px;color:#8d939c;font-size:11px;line-height:1.55}
.ob500-launch-progress{height:4px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.07)}
.ob500-launch-progress>i{display:block;height:100%;width:100%;transform:translateX(-100%);border-radius:inherit;background:linear-gradient(90deg,#d9703f,#f59a62,#ffc39b);animation:vano-launch-progress 820ms ease-out forwards}
@keyframes vano-launch-progress{to{transform:none}}
body.vano-onboarding-leaving .ob500-shell{pointer-events:none}

/* Entry splash waits for the map instead of disappearing on a blind timer */
.vano-entry-splash{
  transition:opacity 360ms ease,visibility 360ms ease,filter 360ms ease;
}
.vano-entry-splash .vano-entry-splash-inner{
  transition:transform 460ms var(--vano-motion-spring),opacity 280ms ease;
}
.vano-entry-splash.is-onboarding-handoff .vano-entry-splash-inner{
  min-width:min(340px,calc(100vw - 48px));
}
.vano-entry-splash-inner>small{
  display:block;
  margin-top:10px;
  color:#858b94;
  font-size:9px;
  letter-spacing:.03em;
}
.vano-entry-progress{
  display:block;
  height:3px;
  margin-top:14px;
  overflow:hidden;
  border-radius:99px;
  background:rgba(255,255,255,.08);
}
.vano-entry-progress>i{
  display:block;
  width:100%;
  height:100%;
  transform:translateX(-100%);
  background:linear-gradient(90deg,#d9703f,#f59a62,#ffc39b);
  animation:vano-entry-progress 1.2s ease-out forwards;
}
@keyframes vano-entry-progress{to{transform:none}}
.vano-entry-splash.is-ready .vano-entry-splash-inner{transform:scale(1.018)}
.vano-entry-splash.hide{opacity:0;visibility:hidden;filter:blur(4px)}
.vano-entry-splash.hide .vano-entry-splash-inner{transform:translateY(-8px) scale(.985);opacity:0}

/* Profile personalization feedback */
.profile350-savebar.is-motion-pop{
  animation:vano-savebar-pop 320ms var(--vano-motion-spring);
}
.profile350-section-head.is-motion-soft{
  animation:vano-soft-highlight 300ms ease-out;
}
.profile350-map-card.is-motion-selected,
.profile350-chip-select label.is-motion-selected,
.profile350-accent.is-motion-selected,
[data-language-card].is-motion-selected{
  animation:vano-choice-pop 340ms var(--vano-motion-spring);
}
@keyframes vano-savebar-pop{50%{transform:translateY(-2px)}}
@keyframes vano-soft-highlight{50%{opacity:.72;transform:translateX(2px)}}

/* Map and navigation micro-states */
.vano-map-surface .sheet,
.vano-map-surface .prefs-drawer,
.vano-map-surface .safety-drawer,
.vano-map-surface .account-drawer,
.vano-map-surface .vano-routine-card,
.vano-map-surface .route-card,
.vano-map-surface .search-results,
.vano-map-surface #toast{
  will-change:transform,opacity;
}
.vano-map-surface .prefs-drawer.show,
.vano-map-surface .safety-drawer.show,
.vano-map-surface .account-drawer.show{
  animation:vano-drawer-enter 300ms var(--vano-motion-spring);
}
@keyframes vano-drawer-enter{
  from{opacity:.4;transform:translateY(18px) scale(.992)}
}
body.vano-nav-launching #map{
  filter:saturate(1.035) contrast(1.01);
  transition:filter 520ms ease;
}
body.body-nav:not(.nav-map-free) .mapboxgl-canvas{
  transition:filter 260ms ease;
}
body.nav-map-free .mapboxgl-canvas{
  filter:saturate(.96) brightness(.985);
}
body[data-nav-camera-state="RECENTERING"] #recenterBtn,
body[data-nav-camera-state="RECENTERING"] #navRecenter,
body[data-nav-camera-state="RECENTERING"] #navDrawerRecenter{
  animation:vano-recenter-pulse 700ms ease-out;
}
@keyframes vano-recenter-pulse{
  0%{box-shadow:0 0 0 0 rgba(245,154,98,.28)}
  100%{box-shadow:0 0 0 14px rgba(245,154,98,0)}
}

/* Reduce work and visual noise on constrained devices */
.vano-low-power .ob500-launch-screen>.ring,
.vano-low-power .vano-entry-progress>i{animation-duration:1ms}
.vano-perf-eco .vano-map-surface .prefs-drawer.show,
.vano-perf-eco .vano-map-surface .safety-drawer.show,
.vano-perf-eco .vano-map-surface .account-drawer.show{animation:none}

@media(prefers-reduced-motion:reduce){
  *,
  *::before,
  *::after{
    scroll-behavior:auto!important;
  }
  .ob500-launch-screen,
  .ob500-launch-core,
  .vano-entry-splash,
  .vano-entry-splash .vano-entry-splash-inner{
    transition:none!important;
  }
  .ob500-launch-screen>.ring,
  .ob500-launch-route>span,
  .ob500-launch-progress>i,
  .vano-entry-progress>i,
  body.vano-route-onboarding [data-ob-step].is-active,
  .profile350-savebar.is-motion-pop,
  .profile350-section-head.is-motion-soft,
  .profile350-map-card.is-motion-selected,
  [data-language-card].is-motion-selected,
  body[data-nav-camera-state="RECENTERING"] #recenterBtn,
  body[data-nav-camera-state="RECENTERING"] #navRecenter,
  body[data-nav-camera-state="RECENTERING"] #navDrawerRecenter{
    animation:none!important;
  }
}
'''
    css_path.write_text(css,encoding="utf-8")

# one-shot cleanup
(root/".github"/"workflows"/"experience-css.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
