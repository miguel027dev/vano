import React from 'react';
import {isNativeShell} from '../lib/nativeShell';

/** Visible only while the map chunk loads; never delays a ready map. */
export default function BrandSplash(){
  // Android already displays its own launch/loading screen until the map is ready.
  if(isNativeShell())return null;
  return <main className="vano-splash" role="status" aria-label="Abrindo VANO Maps">
    <div className="vano-splash-mark" aria-hidden="true"><img src="/vano-logo-original.webp" width="116" height="116" alt=""/></div>
    <div className="vano-splash-name" aria-hidden="true">VANO <span>MAPS</span></div>
    <p>Seu caminho começa aqui</p>
  </main>;
}
