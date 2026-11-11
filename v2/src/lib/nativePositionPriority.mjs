/** Give the Android host's verified GPS fixes visual priority while they arrive.
 * The browser watch remains a fallback when the native stream goes quiet.
 */
export function hasRecentNativePosition(lastAcceptedAt,now=Date.now(),graceMs=2800){
  return Number.isFinite(lastAcceptedAt)&&lastAcceptedAt>0&&
    Number.isFinite(now)&&now>=lastAcceptedAt&&now-lastAcceptedAt<graceMs;
}
