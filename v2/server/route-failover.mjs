/**
 * Real route-provider failover. The Mapbox V1-compatible candidate engine is
 * a degraded alternative: it NEVER claims that route safety is verified.
 * Only explicit, trusted providers can calculate a real route.
 */
export function createRouteFailover({cooldownMs=45_000, clock=Date.now, onFallback=()=>{}}={}){
  let blockedUntil=0;
  let inFallback=false;
  return async ({original,alternate})=>{
    if(typeof original!=='function')throw Error('Motor original não configurado.');
    if(clock()>=blockedUntil){
      try{
        const result=await original();
        blockedUntil=0;inFallback=false;
        return result;
      }catch(e){
        blockedUntil=clock()+cooldownMs;
        if(!inFallback){inFallback=true;onFallback(e);}
      }
    }
    if(typeof alternate!=='function')throw Error('Motor original indisponível e não há provedor alternativo configurado.');
    try{
      const result=await alternate();
      if(!result||!Array.isArray(result.routes)||!result.routes.length)throw Error('Provedor alternativo sem rotas.');
      return result;
    }catch(e){
      throw Error('Não foi possível calcular a rota com os provedores disponíveis. Tente novamente em instantes.',{cause:e});
    }
  };
}
