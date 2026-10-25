// Preferences are stored per account; map road controls and public safety layers remain independent.
export const POI_CHOICES=Object.freeze([
 ['farmacia','Farmácia','pill'],
 ['academia','Academia','dumbbell'],
 ['estacionamento','Estacionamento','square-parking'],
 ['combustivel','Combustível','fuel'],
 ['aeroporto','Aeroporto','plane'],
 ['recarga','Recarga elétrica','plug-zap'],
 ['trem','Estação de trem','train-front'],
 ['pedagio','Pedágio','ticket'],
 ['restaurante','Restaurante','utensils'],
 ['supermercado','Supermercado / mercado','shopping-cart'],
 ['shopping','Shopping','shopping-bag'],
 ['hospital','Hospital','hospital'],
 ['escola','Escola','graduation-cap'],
 ['delegacia','Delegacia','shield-check'],
 ['cafeteria','Cafeteria','coffee']
]);
export const DEFAULT_VISIBLE_POIS=Object.freeze(POI_CHOICES.map(x=>x[0]));
export const PERMANENT_TYPES=new Set([
 'radar','relato-radar','semaforo','rotatoria','travessia','ferrovia','banco','parque',
 'lombada','pare','preferencia','placa','obra','alerta-via','relato-obra','relato-transito',
 'relato-acidente','relato-risco','bombeiros'
]);
export const POI_TYPE_TO_CHOICE=Object.freeze({
 farmacia:'farmacia',academia:'academia',estacionamento:'estacionamento',
 combustivel:'combustivel',aeroporto:'aeroporto',eletroposto:'recarga',
 'estacao-recarga':'recarga','carregador-eletrico':'recarga',
 'estacao-trem':'trem','estacao-ferroviaria':'trem',pedagio:'pedagio',
 restaurante:'restaurante',mercado:'supermercado',supermercado:'supermercado',
 shopping:'shopping',hospital:'hospital',saude:'hospital',
 escola:'escola','policia-base':'delegacia',cafeteria:'cafeteria'
});
export const HIDDEN_LEGACY_TYPES=new Set(['fastfood','hotel','petshop','lavarapido','terminal-onibus','correios']);
export function sanitizePoiVisibility(value){
 if(!Array.isArray(value))return [...DEFAULT_VISIBLE_POIS];
 const valid=new Set(value.filter(x=>typeof x==='string'));
 return DEFAULT_VISIBLE_POIS.filter(x=>valid.has(x));
}
export function personalizedPoiAllowed(type,visible){
 if(PERMANENT_TYPES.has(type))return true;
 if(HIDDEN_LEGACY_TYPES.has(type))return false;
 const id=POI_TYPE_TO_CHOICE[type];
 if(!id)return false;
 return sanitizePoiVisibility(visible).includes(id);
}
