/** Static, self-contained VANO destination pin.
 * The tip (26,59) is the real arrival coordinate in both map renderers.
 */
export const ARRIVAL_PIN_WIDTH=52;
export const ARRIVAL_PIN_HEIGHT=64;
export const ARRIVAL_PIN_ANCHOR=[26,59];
export function arrivalMarkerSvg(){
 return `<svg class="vano-arrival-svg" viewBox="0 0 52 64" width="52" height="64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M26 2.5C13.1 2.5 3.5 12.6 3.5 25.3c0 15.4 16.2 28.6 22.5 34.2 6.3-5.6 22.5-18.8 22.5-34.2C48.5 12.6 38.9 2.5 26 2.5Z" fill="#fff" stroke="#dfe5e9" stroke-width="1.4" stroke-linejoin="round"/>
  <circle cx="26" cy="25.5" r="17.1" fill="#182634"/>
  <path d="M19.3 15.5V35.3" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M20.2 17c4.7-3.3 7.9 2.7 13.2-.3v11.3c-5.1 3-8.5-3-13.2.3Z" fill="#ff781e"/>
 </svg>`;
}
