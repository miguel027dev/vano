/**
 * Keep the screen awake only while a navigation session is active.
 * Browsers may deny/release a wake lock (battery saver, hidden tab, etc.).
 * This is best-effort and must never block route calculation.
 */
export function startNavigationWakeLock({
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  windowObject = globalThis.window,
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
          if (sentinel === acquired) sentinel = null;
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
    if (doc.visibilityState === 'visible') void acquire();
    else release();
  }
  function onFocus() { void acquire(); }
  function onPageHide() { release(); }
  function onPageShow() { void acquire(); }

  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener('focus', onFocus);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  void acquire();

  return () => {
    stopped = true;
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    win.removeEventListener('focus', onFocus);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('pageshow', onPageShow);
    release();
  };
}
