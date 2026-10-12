import React, { useEffect, useState } from 'react';

/** Short visual acknowledgement once per tab; never delays data or navigation. */
export default function BrandSplash(){
  const [visible, setVisible] = useState(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      return sessionStorage.getItem('vano-v3-splash-seen') !== '1';
    } catch { return false; }
  });
  useEffect(() => {
    if (!visible) return;
    try { sessionStorage.setItem('vano-v3-splash-seen', '1'); } catch {}
    const id = window.setTimeout(() => setVisible(false), 620);
    return () => window.clearTimeout(id);
  }, [visible]);
  if (!visible) return null;
  return <div className="v3-brand-splash" aria-hidden="true"><img src="/vano-logo-original.webp" width="64" height="64" alt=""/><span>VANO <small>MAPS</small></span></div>;
}
