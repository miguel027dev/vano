/**
 * Dataset policy is deliberately separate from WFS discovery.  A public endpoint
 * or a successful sample is not a licence, freshness, or fitness approval.
 *
 * These rules also prevent personal/account attributes from ever becoming route
 * inputs. The safe-routing engine receives only public spatial evidence.
 */
const LAYERS=Object.freeze({
  lights:{layer:'geoportal:iluminacao_publica',kind:'public-infrastructure',routingUse:'inventory-context'},
  roads:{layer:'geoportal:segmento_logradouro',kind:'public-road-network',routingUse:'geometry-alignment'},
  sidewalks:{layer:'geoportal:calcada',kind:'public-infrastructure',routingUse:'context-only'},
  busLanes:{layer:'geoportal:faixa_onibus',kind:'public-road-regulation',routingUse:'context-only'},
  // These records concern areas/occurrences, not people. They must never be
  // used to penalize neighbourhoods or infer anything about their residents.
  hydrologicalRisk:{layer:'geoportal:risco_hidrologico',kind:'public-historical-hazard',routingUse:'display-not-routing',sensitivePopulationContext:true,
    metadataUrl:'https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/api/records/cefffc6d-8d1d-419b-a267-8d87a37b9e0e'},
  floodHistory:{layer:'geoportal:risco_ocorrencia_alagamento',kind:'public-historical-hazard',routingUse:'display-not-routing',sensitivePopulationContext:true},
  signals:{layer:'geoportal:semaforo',kind:'public-infrastructure',routingUse:'context-only'},
  structures:{layer:'geoportal:obra_arte',kind:'public-infrastructure',routingUse:'geometry-review'}
});

export const SAFE_ROUTING_DATASET_POLICY=Object.freeze(Object.fromEntries(Object.entries(LAYERS).map(([key,rule])=>[key,Object.freeze({
  ...rule,
  // Every entry starts blocked. A reviewed, dated approval is required later.
  approval:'pending-license-crs-quality-review',
  mayUploadFullSnapshot:false,
  mayInfluenceAutomaticRanking:false,
  containsPersonalData:false,
  sensitivePopulationContext:rule.sensitivePopulationContext===true
})])));

export const FORBIDDEN_ROUTE_INPUTS=Object.freeze(['name','fullName','email','phone','age','birthDate','accountId','userId','preciseLocationHistory']);

export function assertNoPersonalRouteInputs(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Contexto de rota inválido');
 for(const key of FORBIDDEN_ROUTE_INPUTS)if(Object.hasOwn(input,key))throw Error(`Dado pessoal proibido no cálculo de rota: ${key}`);
 return true;
}

/** A signed human approval is represented by a short immutable record, not a flag. */
export function validateDatasetApproval(record,{now=Date.now(),maxAgeDays=30}={}){
 if(!record||typeof record!=='object'||Array.isArray(record))return {approved:false,reason:'missing-approval'};
 const rule=Object.values(SAFE_ROUTING_DATASET_POLICY).find(x=>x.layer===record.layer);
 if(!rule)return {approved:false,reason:'unknown-layer'};
 if(record.licenseAccepted!==true||record.crsValidated!==true||record.geometryValidated!==true||
    record.freshnessValidated!==true||record.approvedForRouting!==true)return {approved:false,reason:'incomplete-approval'};
 if(typeof record.approvedBy!=='string'||!record.approvedBy.trim()||record.approvedBy.length>100)return {approved:false,reason:'invalid-approver'};
 const approvedAt=Date.parse(record.approvedAt);
 if(!Number.isFinite(approvedAt)||approvedAt>now||now-approvedAt>maxAgeDays*86400000)return {approved:false,reason:'expired-approval'};
 return {approved:true,layer:record.layer,approvedAt:new Date(approvedAt).toISOString(),routingUse:rule.routingUse};
}

export function canUseSnapshotForRanking({datasetApproval,snapshot,now,maxAgeDays}={}){
 const approval=validateDatasetApproval(datasetApproval,{now,maxAgeDays});
 if(!approval.approved)return {allowed:false,reason:approval.reason};
 if(!snapshot||typeof snapshot!=='object'||snapshot.stage!=='approved' || snapshot.licenseReviewed!==true || snapshot.usedForRouting!==true)
  return {allowed:false,reason:'snapshot-not-approved'};
 if(snapshot.layer!==approval.layer)return {allowed:false,reason:'approval-snapshot-mismatch'};
 return {allowed:true,layer:approval.layer,routingUse:approval.routingUse};
}
