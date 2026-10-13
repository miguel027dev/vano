import React from 'react';
import {MANEUVER_PATHS,MANEUVER_SECONDARY_PATHS} from '../lib/maneuverVisuals';

/** Vanu-owned navigation pictograms, matched to the 48px roundabout reference. */
export default function ManeuverGlyph({variant='straight',size=34}) {
  const path = MANEUVER_PATHS[variant] || MANEUVER_PATHS.straight;
  return <svg className="v46-maneuver-svg" width={size} height={size} viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="4"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {variant === 'roundabout' && <circle cx="24" cy="22" r="11"/>}
    {variant === 'arrive' && <circle cx="24" cy="20" r="4"/>}
    {MANEUVER_SECONDARY_PATHS[variant] && <path d={MANEUVER_SECONDARY_PATHS[variant]} strokeOpacity=".27"/>}
    <path d={path}/>
  </svg>;
}
