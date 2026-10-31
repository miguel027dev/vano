/** Client address used for abuse limits. Never trust the leftmost unverified XFF value. */
import net from 'node:net';
export function trustedProxyPeer(raw){
  const value=String(raw||'').replace(/^::ffff:/i,'');
  if(value==='::1')return true;
  if(net.isIP(value)!==4)return false;
  const [a,b]=value.split('.').map(Number);
  return a===127 || a===10 || (a===172&&b>=16&&b<=31) || (a===192&&b===168);
}
export function resolveClientIP(req,{trustProxy=false,hops=1}={}){
  const direct=String(req?.socket?.remoteAddress||'unknown');
  if(!trustProxy||!trustedProxyPeer(direct))return direct;
  // CF-Ray and CF-Connecting-IP can be spoofed through a direct Render URL.
  // Explicit opt-in is safe ONLY with Cloudflare-only origin access verified.
  const cfClient=String(req?.headers?.["cf-connecting-ip"]||"").trim();
  if(process.env.VANO_TRUST_CF_HEADERS==="1" && req?.headers?.["cf-ray"] && net.isIP(cfClient))return cfClient;
  // Last addresses are appended by the ingress. Untrusted clients can PREPEND
  // fake entries, so x-forwarded-for.split(',')[0] is unsafe for rate limiting.
  const chain=String(req?.headers?.['x-forwarded-for']||'').split(',').map(s=>s.trim());
  const count=Number.isSafeInteger(hops)&&hops>=1&&hops<=5?hops:1;
  const candidate=chain.at(-count);
  return net.isIP(candidate||'')?candidate:direct;
}
