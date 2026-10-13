import React from 'react';

export default function MotorcycleIcon({size=22,...props}){
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="5" cy="17" r="3.25"/><circle cx="19" cy="17" r="3.25"/>
    <path d="M5 17l3.5-5h4l2 5H5M8.5 12l-2-2H4M11 12l1.5-3h3L19 17M15.5 9l-1-3H12M16 10h2.5"/>
  </svg>;
}
