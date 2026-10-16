/** A long-running trip can request fresh navigation speech authorization.
 * The signing key and authenticated guest/account identity never leave the
 * backend. Expiration of a history proof must not silence ongoing navigation.
 * This does not extend the lifetime of history-writing authorizations.
 */
export const NAVIGATION_VOICE_PROOF_GRACE_MS=24*60*60*1000;
export function mayUseNavigationVoiceProof(proof,identity,now=Date.now()){
 if(!proof||proof.type!=='trip'||proof.user!==identity||!identity||
    !['fast','safe'].includes(proof.kind)||!Number.isFinite(proof.expires)||
    proof.expires>now+601000||proof.expires<now-NAVIGATION_VOICE_PROOF_GRACE_MS||
    typeof proof.nonce!=='string'||!/^[a-f0-9]{24}$/.test(proof.nonce)||
    !Array.isArray(proof.dest)||proof.dest.length!==2||
    !proof.dest.every((x,i)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=(i===0?180:90))||
    !Number.isFinite(proof.mins)||proof.mins<=0||proof.mins>10080||
    !Number.isFinite(proof.km)||proof.km<=0||proof.km>3000)return false;
 return true;
}
export function renewedNavigationProofPayload(proof,now=Date.now()){
 return {...proof,expires:now+10*60*1000};
}
