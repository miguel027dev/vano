/** Pure, conservative presentation rules for the private V2 maneuver island.
 * The provider's full directions and all voice/navigation events are untouched. */
const straightWords=/\b(continue|seguir|siga|reto|reta|frente|straight|forward|tout droit|continuez)\b/i;
const turnWords=/\b(vire|virar|curva|esquerda|direita|converta|sa[ií]da|acesso|faixa|retorno|rotat[oó]ria|turn|exit|ramp|left|right|tournez|sortie)\b/i;
const straightKinds=new Set(['continue','depart','departure','straight','new name','notification']);

export function dynamicManeuverIsland(step,{vehicle='carro',language='pt-BR',crossingNearby=false}={}){
  const instruction=typeof step?.instruction==='string'?step.instruction.trim():'';
  const modifier=typeof step?.modifier==='string'?step.modifier.trim().toLowerCase():'';
  const kind=typeof step?.kind==='string'?step.kind.trim().toLowerCase():'';
  const distance=step?.distance;
  const plausibleStraight=(modifier==='straight'||straightKinds.has(kind)||straightWords.test(instruction))&&
    (!modifier||modifier==='straight')&&
    !turnWords.test(instruction)&&
    !/(turn|roundabout|rotary|fork|ramp|arriv|merge|exit|uturn)/i.test(kind);
  const threshold=vehicle==='a-pe'?160:330;
  const compact=plausibleStraight&&typeof distance==='number'&&Number.isFinite(distance)&&
    distance>=threshold&&!crossingNearby&&!(step?.following?.gapMeters<90);
  const concise=language.startsWith('en')?'Continue straight':language.startsWith('fr')?'Continuez tout droit':'Siga em frente';
  return {compact,instruction:compact?concise:instruction};
}
