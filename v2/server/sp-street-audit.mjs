/** Administrator-only read-only overview of the audited São Paulo street
 * inventory. These counts reproduce the local 2025 CEM data audit, NOT
 * official 2026 street validation or any measured congestion evidence.
 *
 * The full 7,500-row source is intentionally not bundled here: retention and
 * redistribution rights for third-party source datasets must be reviewed.
 * Admins may inspect a local exported CSV client-side without uploading it.
 */
export const SP_STREET_QA=Object.freeze({
 schemaVersion:1,
 auditVersion:'2026-10-21',
 scope:'Sao Paulo municipality, streets only',
 source:'CEM/USP LOG2025 RMSP (cartographic source 2025)',
 sourceUrl:'https://centrodametropole.fflch.usp.br/pt-br/node/17657',
 sourceSha256:'f9e2cafb8009cdd148c023b3415b3f62c8f220a0955da4dfb0df4dd6f0ac5f2c',
 cetReferenceUrl:'https://ssl.cetsp.com.br/consultas/classificacao-viaria.aspx',
 geosampaReferenceUrl:'https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx',
 records:7500,
 internallyConsistent:7421,
 reviewRequired:79,
 districts:97,
 issues:{
  nameDistrictNotFound:46,
  segmentCountMismatch:33,
  lengthMismatch:30,
  alternative1NameMissing:40,
  alternative2NameMissing:38
 },
 evidence:{
  independentlyValidatedRoads:0,
  historicTrafficSamples:0,
  verifiedPeakHours:0,
  verifiedDirections:0,
  verifiedSlopes:0,
  approvedDetours:0,
  licenseForHistoricalUse:false,
  routingEligible:0
 },
 mode:'audit-only',
 modifiesEta:false,
 modifiesRoute:false,
 reviewReasons:[
  'Conferência externa completa com GeoSampa/CET pendente',
  'Medições históricas por rua, segmento, sentido e horário inexistentes no lote',
  'Mão, conexões, restrições legais e inclinação das alternativas não verificadas',
  'Condições de licença e armazenamento dos dados de trânsito não confirmadas'
 ]
});
export function adminStreetAuditSnapshot(){
 return {...SP_STREET_QA,issues:{...SP_STREET_QA.issues},
  evidence:{...SP_STREET_QA.evidence},
  reviewReasons:[...SP_STREET_QA.reviewReasons]};
}
export function mayUseStreetAuditForRouting(entry){
 return Boolean(entry?.verifiedTraffic===true&&entry?.licenseApproved===true&&
 entry?.directionVerified===true&&entry?.topologyVerified===true&&
 entry?.alternateLegal===true&&Number.isFinite(entry?.sampleCount)&&
 entry.sampleCount>=12&&entry?.adminApproved===true);
}
