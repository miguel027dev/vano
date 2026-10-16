/**
 * Keep the screen awake only while a navigation session is active.
 * Browsers may deny/release a wake lock (battery saver, hidden tab, etc.).
 * This is best-effort and must never block route calculation.
 */
export function startNavigationWakeLock({
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const nav = navigatorObject;
  const doc = documentObject;
  const win = windowObject;
  if (!nav?.wakeLock?.request || !doc?.addEventListener || !win?.addEventListener) {
    return () => {};
  }

  let stopped = false;
  let sentinel = null;
  let requesting = false;
  let retryAfterRequest = false;
  let retryTimer = null, releaseRetries = 0;

  function retryUnexpectedRelease(){
    if(stopped||doc.visibilityState!=='visible'||retryTimer!==null||releaseRetries>=3)return;
    const delay=Math.min(12000,2000*2**releaseRetries++);
    retryTimer=setTimer(()=>{
      retryTimer=null;
      if(!stopped&&doc.visibilityState==='visible'&&!sentinel)void acquire();
    },delay);
  }
  function release() {
    const current = sentinel;
    sentinel = null;
    if (!current) return;
    try {
      void Promise.resolve(current.release()).catch(() => {});
    } catch {
      // A wake-lock error must never interrupt navigation.
    }
  }

  async function acquire() {
    if (stopped || doc.visibilityState !== 'visible' || sentinel) return;
    if (requesting) {
      retryAfterRequest = true;
      return;
    }
    requesting = true;
    try {
      const acquired = await nav.wakeLock.request('screen');
      if (stopped || doc.visibilityState !== 'visible') {
        await acquired.release();
      } else {
        sentinel = acquired;
        acquired.addEventListener?.('release', () => {
          if (sentinel === acquired) {
            sentinel = null;
            // Browser/OS may drop an active screen wake lock unexpectedly.
            retryUnexpectedRelease();
          }
        }, { once: true });
      }
    } catch {
      // Unsupported/denied by OS or browser: navigation remains usable.
    } finally {
      requesting = false;
      if (retryAfterRequest) {
        retryAfterRequest = false;
        if (!stopped && doc.visibilityState === 'visible' && !sentinel) {
          void acquire();
        }
      }
    }
  }

  function onVisibilityChange() {
    if (doc.visibilityState === 'visible') {releaseRetries=0;void acquire();}
    else {if(retryTimer!==null){clearTimer(retryTimer);retryTimer=null;}release();}
  }
  function onFocus() {releaseRetries=0;void acquire(); }
  function onPageHide() { release(); }
  function onPageShow() {releaseRetries=0;void acquire(); }

  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener('focus', onFocus);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  void acquire();

  return () => {
    stopped = true;
    if(retryTimer!==null){clearTimer(retryTimer);retryTimer=null;}
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    win.removeEventListener('focus', onFocus);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('pageshow', onPageShow);
    release();
  };
}
