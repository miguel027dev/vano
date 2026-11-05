/** Per-key partner capabilities; never infer permissions from a visible UI toggle. */
export const PARTNER_SCOPE_CATALOG=Object.freeze([
 {id:'map:read',label:'Mapa VANO Branco e Preto',description:'Mapa interativo, estilos oficiais e sessão do SDK.',default_enabled:true},
 {id:'places:read',label:'Pesquisa e coordenadas',description:'Busca de locais, detalhes e geocodificação reversa.',default_enabled:true},
 {id:'routes:read',label:'Cálculo de rotas',description:'Trajetos, alternativas e recálculo de navegação.',default_enabled:true},
 {id:'radars:read',label:'Radares',description:'Radares mapeados, sujeitos à cobertura e disponibilidade da fonte.',default_enabled:true},
 {id:'signals:read',label:'Semáforos',description:'Posições cadastradas de semáforos; não informa fase ou tempo do sinal.',default_enabled:true},
 {id:'signs:read',label:'Sinalização viária',description:'Lombadas, placas, preferência, parada e travessias mapeadas.',default_enabled:true},
 {id:'pois:read',label:'Pontos de interesse',description:'Hospitais, postos, estacionamentos e serviços próximos.',default_enabled:true},
 {id:'traffic:read',label:'Trânsito',description:'Dados de trânsito e incidentes de fornecedores disponíveis.',default_enabled:false},
 {id:'context:read',label:'Contexto e eventos de vias',description:'Camadas regionais de ocorrências e contexto público.',default_enabled:false},
 {id:'reports:read',label:'Relatos da comunidade',description:'Consulta a ocorrências comunitárias do VANO.',default_enabled:false},
 {id:'reports:write',label:'Publicar relatos',description:'Permissão sensível para publicar e confirmar relatos.',default_enabled:false},
 {id:'transit:read',label:'Transporte público',description:'Planejamento sujeito à configuração e região atendida.',default_enabled:false},
 {id:'benchmarks:read',label:'Indicadores publicados',description:'Resultados públicos de benchmark, quando publicados.',default_enabled:false}
]);
export const PARTNER_SCOPES=Object.freeze(PARTNER_SCOPE_CATALOG.map(item=>item.id));
export const DEFAULT_PARTNER_SCOPES=Object.freeze(PARTNER_SCOPE_CATALOG.filter(item=>item.default_enabled).map(item=>item.id));

export const MAP_SERVICE_SCOPE=Object.freeze({
 'map-features':null, // Mixed feed must be filtered on every response.
 'map-radars':'radars:read',
 'places/tomtom':'pois:read',
 'places/openchargemap':'pois:read',
 'places/overture':'pois:read',
 'traffic/incidents/tomtom':'traffic:read',
 'road-events/regional':'context:read'
});
export const ROAD_SIGN_TYPES=Object.freeze(['lombada','pare','preferencia','placa','travessia','ferrovia','rotatoria','obra','alerta-via']);
const roadSignSet=new Set(ROAD_SIGN_TYPES);
const mapScopeSet=new Set(['pois:read','radars:read','signals:read','signs:read','reports:read']);
export function partnerMapServices(scopes=[]){
 const allowed=new Set(scopes);
 if(!allowed.has('map:read'))return [];
 return Object.entries(MAP_SERVICE_SCOPE).filter(([name,scope])=>
  name==='map-features'?[...mapScopeSet].some(s=>allowed.has(s)):!scope||allowed.has(scope)
 ).map(([name])=>name);
}
/** Map features and /pois are mixed-source feeds; apply permission checks per item. */
export function filterPartnerMapFeatures(features=[],scopes=[]){
 const allowed=new Set(scopes);
 return (Array.isArray(features)?features:[]).filter(item=>{
  const type=String(item?.type||'');
  if(type==='radar'||type==='relato-radar')return allowed.has('radars:read');
  if(type==='semaforo')return allowed.has('signals:read');
  if(type.startsWith('relato-'))return allowed.has('reports:read');
  if(roadSignSet.has(type))return allowed.has('signs:read');
  return allowed.has('pois:read');
 });
}
