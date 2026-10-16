// Pure, deterministic JEV helpers shared by the browser and Node API.
export function classifyJev(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 360) return 'unknown';
  const s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  if (/\b(radar|radares|camera de velocidade|cameras de velocidade)\b/.test(s) && /\b(menos|sem|evit|desvi|fug|reduz|troca|muda|nao)\w*/.test(s)) return 'radar_unavailable';
  if (/\b(pedagio|pedagios|toll)\b/.test(s) && /\b(sem|evit|nao|desvi|fug|tir|quero|menos|reduz)\w*/.test(s)) return 'avoid_tolls';
  if (/\b(ladeira|subida|morro|aclive|inclinacao)\b/.test(s)) return 'slope_unavailable';
  if (/\b(transito|congestionamento|engarrafamento|engarrafado|trafego)\b/.test(s)) return 'traffic';
  if (/\b(outra rota|outro caminho|caminho diferente|rota alternativa|troca a rota|trocar a rota|troque a rota|troca rota|muda a rota|nao gostei dessa|nao gostei da rota|recalcula|mudar a rota|desviar|por outro lado|mais rapido)\b/.test(s)) return 'alternative';
  return 'unknown';
}
export function jevRouteFingerprint(route) {
  const points = route?.geometry?.coordinates;
  if (!Array.isArray(points) || points.length < 2) return null;
  let value = 2166136261;
  const step = Math.max(1, Math.floor((points.length - 1) / 16));
  const indices = [];
  for (let i=0;i<points.length;i+=step) indices.push(i);
  if(indices[indices.length-1]!==points.length-1)indices.push(points.length-1);
  for(const i of indices) {
    const point=points[i];
    if(!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1]))return null;
    const datum=String(Math.round(point[0]*100000))+','+String(Math.round(point[1]*100000))+';';
    for(let j=0;j<datum.length;j++)value=Math.imul(value^datum.charCodeAt(j),16777619);
  }
  return points.length+':'+(value>>>0).toString(16);
}
export function chooseJevProposal(routes, currentKey, intent) {
  if(!Array.isArray(routes)) return null;
  const valid=routes.filter(r=>r&&['safe','fast'].includes(r.id) && Number.isFinite(r.duration) && r.duration>0 && jevRouteFingerprint(r));
  const candidates=valid.filter(r=>jevRouteFingerprint(r)!==currentKey);
  if(!candidates.length) return null;
  if(intent==='traffic')return candidates.find(r=>r.id==='safe')||candidates[0];
  return candidates.find(r=>r.id==='fast')||candidates[0];
}
