/** Human-friendly route duration; the routing engine continues to use integer minutes. */
export function formatTravelTime(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}
