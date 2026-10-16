/**
 * VANO Safe Routing — experimental ranking of real candidate routes.
 * Pure module. No I/O, no network, no production route mutation.
 *
 * NEVER interprets census demographics or favela boundaries as danger.
 * Lighting points are infrastructure evidence, not proof lights are working.
 */
const rad = value => value * Math.PI / 180;
const deg = value => value * 180 / Math.PI;
const validFraction = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const inSaoPaulo = ([lon,lat]) =>
  Number.isFinite(lon) && Number.isFinite(lat) && lon >= -47.5 && lon <= -46.1 && lat >= -24.2 && lat <= -23.1;

export function solarElevation(dateInput, [longitude, latitude]) {
  const time = new Date(dateInput);
  if (!Number.isFinite(time.getTime()) || !inSaoPaulo([longitude, latitude])) throw new TypeError('Invalid time or São Paulo coordinates');
  const days = (time.getTime() / 86400000 + 2440587.5) - 2451545;
  const normalize = x => ((x % 360) + 360) % 360;
  const meanLongitude = normalize(280.460 + 0.9856474 * days);
  const anomaly = rad(normalize(357.528 + 0.9856003 * days));
  const ecliptic = rad(normalize(meanLongitude + 1.915 * Math.sin(anomaly) + 0.020 * Math.sin(2 * anomaly)));
  const obliquity = rad(23.439 - 0.0000004 * days);
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(ecliptic), Math.cos(ecliptic));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(ecliptic));
  const sidereal = rad(normalize(280.46061837 + 360.98564736629 * days + longitude));
  const hourAngle = sidereal - rightAscension;
  const altitude = Math.asin(Math.sin(rad(latitude)) * Math.sin(declination) +
    Math.cos(rad(latitude)) * Math.cos(declination) * Math.cos(hourAngle));
  return deg(altitude);
}

export function daylightPeriod(dateInput, location) {
  const altitude = solarElevation(dateInput, location);
  return altitude >= 0 ? 'day' : altitude >= -6 ? 'twilight' : 'night';
}

function assess(route, period, at) {
  if (!route || typeof route.id !== 'string' || !Number.isFinite(route.duration) ||
      route.duration <= 0 || !Number.isFinite(route.distance) || route.distance <= 0) {
    return {valid:false, reason:'invalid_route'};
  }
  const segments = Array.isArray(route.segments) ? route.segments : [];
  let observedMeters = 0, totalMeters = 0, uncertainty = 0, exposure = 0;
  let viableSourceCount = 0;
  for (const segment of segments) {
    const metres = segment?.meters;
    if (!Number.isFinite(metres) || metres <= 0 || metres > 100_000) continue;
    totalMeters += metres;
    const lighting = segment.lightingCoverage;
    const surface = segment.surfaceCondition;
    // Light inventory matters after sunset; do not claim a light is functioning.
    const available = period === 'day' ? validFraction(surface) :
      validFraction(lighting);
    if (!available) continue;
    const updated = new Date(segment.sourceUpdatedAt || '');
    const ageDays = Number.isFinite(updated.getTime())
      ? Math.max(0, (at.getTime() - updated.getTime()) / 86400000) : Infinity;
    const freshness = ageDays <= 365 ? 1 : ageDays <= 730 ? 0.8 : 0.5;
    const condition = period === 'day'
      ? 1 - surface
      : 1 - lighting;
    observedMeters += metres;
    exposure += metres * condition;
    uncertainty += metres * (1 - freshness);
    viableSourceCount++;
  }
  const coverage = totalMeters > 0 ? observedMeters / totalMeters : 0;
  const confidence = observedMeters > 0 ? coverage * (1 - uncertainty / observedMeters) : 0;
  return {
    valid:true, id:route.id, duration:route.duration,
    distance:route.distance, period,
    evidenceCoverage:Number(coverage.toFixed(3)),
    confidence:Number(confidence.toFixed(3)),
    conditionPenalty:observedMeters ? Number((exposure / observedMeters).toFixed(3)) : null,
    observedSegments:viableSourceCount,
    verifiedSafety:false
  };
}

/**
 * @param {object} input
 * @param {Array} input.routes Existing provider routes. Each route contains
 * segments already matched by trusted offline ETL; never match raw points here.
 * @param {string} input.departureAt ISO8601 with timezone.
 * @param {number[]} input.location [longitude,latitude] within São Paulo.
 * @returns Recommendation plus evidence. Never replaces provider geometry.
 */
export function evaluateSafeRouting({routes, departureAt, location, maxExtraMinutes=7, maxExtraRatio=0.30}={}) {
  if (!Array.isArray(routes) || !routes.length || routes.length > 16) throw new TypeError('Invalid candidate route count');
  if (typeof departureAt !== 'string' || !/Z$|[+-]\d{2}:\d{2}$/.test(departureAt))
    throw new TypeError('departureAt must include timezone');
  const at = new Date(departureAt);
  const period = daylightPeriod(at, location);
  const assessments = routes.map(route => assess(route, period, at));
  const valid = assessments.filter(r => r.valid);
  if (!valid.length) return {status:'fallback', reason:'no_valid_route', period, assessments, recommendedRouteId:null};
  const fastest = [...valid].sort((a,b)=>a.duration-b.duration)[0];
  const enoughEvidence = r => r.evidenceCoverage >= 0.70 && r.confidence >= 0.60 && r.conditionPenalty !== null;
  const candidates = valid.filter(r=>enoughEvidence(r) &&
    r.duration-fastest.duration <= maxExtraMinutes &&
    r.duration <= fastest.duration*(1+maxExtraRatio));
  // Ranking only when the fastest route has sufficiently reliable evidence too.
  // Otherwise the comparison would be misleading.
  let choice = fastest, reason = 'insufficient_comparable_evidence';
  if (enoughEvidence(fastest) && candidates.length > 1) {
    const winner = [...candidates].sort((a,b)=>a.conditionPenalty-b.conditionPenalty || a.duration-b.duration)[0];
    if (winner.conditionPenalty <= fastest.conditionPenalty - 0.10) {
      choice = winner;
      reason = 'better_documented_conditions';
    } else reason = 'no_material_improvement';
  }
  return {status:choice===fastest?'fallback':'ranked', reason, period,
    recommendedRouteId:choice.id, fastestRouteId:fastest.id,
    assessments, safetyVerified:false,
    explanation:'Condições estimadas a partir de cadastros; não há garantia de segurança nem confirmação de lâmpadas funcionando.'};
}
