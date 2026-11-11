import React from 'react';
import { Link } from 'react-router-dom';

/** VANO original brand asset from the user's logo library. No generated mark. */
export function Brand({ small = false, to = '/mapa', className = '' }) {
  return <Link to={to} className={`brand brand-v3 ${small ? 'brand-small' : ''} ${className}`.trim()} aria-label="VANO Maps">
    <img src="/vano-logo-original.webp" width="44" height="44" alt="" decoding="async" />
    <span className="brand-v3-wordmark"><strong>VANO</strong><small>MAPS</small></span>
  </Link>;
}
