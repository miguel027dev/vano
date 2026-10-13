/** Small, dependency-free presentation contract for provider navigation steps. */
const normal = value => typeof value === 'string'
  ? value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  : '';

/** Every variant uses the same 48x48 canvas, 4px round stroke and connected arrow geometry. */
export const MANEUVER_PATHS = Object.freeze({
  straight: 'M24 42V8 M14 18L24 8L34 18',
  right: 'M13 42V27Q13 15 25 15H40 M31 6L40 15L31 24',
  left: 'M35 42V27Q35 15 23 15H8 M17 6L8 15L17 24',
  'slight-right': 'M14 42V32Q14 27 19 23L36 9 M27 9H36V18',
  'slight-left': 'M34 42V32Q34 27 29 23L12 9 M21 9H12V18',
  'sharp-right': 'M13 42V20Q13 10 23 10H40 M31 2L40 10L31 18',
  'sharp-left': 'M35 42V20Q35 10 25 10H8 M17 2L8 10L17 18',
  uturn: 'M35 42V22A11 11 0 0 0 13 22V37 M5 29L13 37L21 29',
  'fork-right': 'M22 42V28Q22 21 29 16L38 9 M29 9H38V18',
  'fork-left': 'M26 42V28Q26 21 19 16L10 9 M19 9H10V18',
  'ramp-right': 'M13 42V30Q13 24 23 19L37 10 M28 9L37 10L35 19',
  'ramp-left': 'M35 42V30Q35 24 25 19L11 10 M20 9L11 10L13 19',
  // Ring, entry and exit meet exactly. No floating/disconnected "roundabout arrow".
  roundabout: 'M24 42V33 M35 22H43 M36 15L43 22L36 29',
  arrive: 'M24 42C19 35 12 28 12 20A12 12 0 1 1 36 20C36 28 29 35 24 42Z',
});
export const MANEUVER_SECONDARY_PATHS = Object.freeze({
  'fork-right': 'M22 28V8',
  'fork-left': 'M26 28V8',
  'ramp-right': 'M13 30V9',
  'ramp-left': 'M35 30V9',
});

export function maneuverVariant(step = {}) {
  const kind = normal(step?.kind || step?.type);
  const modifier = normal(step?.modifier);
  if (/roundabout|rotary|rotatoria/.test(kind)) return 'roundabout';
  if (/arrive|arrival|destination|chegada/.test(kind)) return 'arrive';
  if (/u ?turn|retorno|meia volta/.test(modifier) || /u ?turn/.test(kind)) return 'uturn';
  const direction = /left|esquerda/.test(modifier) ? 'left'
    : /right|direita/.test(modifier) ? 'right' : null;
  if (/fork|bifurca/.test(kind)) return direction ? 'fork-' + direction : 'straight';
  if (/ramp|exit|saida|entrada/.test(kind)) return direction ? 'ramp-' + direction : 'straight';
  if (!direction) return 'straight';
  if (/slight|leve/.test(modifier)) return 'slight-' + direction;
  if (/sharp|acentuad|forte/.test(modifier)) return 'sharp-' + direction;
  return direction;
}

/** A lane can support multiple directions. Render up to two real provider values, never invented arrows. */
export function laneVariants(lane) {
  const indications = Array.isArray(lane?.indications) ? lane.indications : [];
  const seen = new Set();
  for (const indication of indications) {
    const word = normal(indication);
    if (!word) continue;
    const variant = maneuverVariant({modifier:word});
    if (variant === 'straight' && !/straight|reto|frente/.test(word)) continue;
    if (!seen.has(variant)) seen.add(variant);
    if (seen.size === 2) break;
  }
  return [...seen];
}

export function displayManeuverDistance(meters, language = 'pt-BR') {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return '—';
  if (meters <= 15) return language.startsWith('en') ? 'Now' : language.startsWith('fr') ? 'Maintenant' : 'Agora';
  const rounded = Math.round(meters / (meters < 100 ? 5 : 10)) * (meters < 100 ? 5 : 10);
  if (rounded < 1000) return rounded + ' m';
  const value = Math.round(rounded / 100) / 10;
  return String(value).replace('.', language.startsWith('en') ? '.' : ',') + ' km';
}

export function maneuverText(step, fallback = 'Continue pela rota') {
  const instruction = typeof step?.instruction === 'string' && step.instruction.trim()
    ? step.instruction.trim() : fallback;
  const street = typeof step?.street === 'string' ? step.street.trim() : '';
  // Provider instructions often already contain the street. Do not repeat it on the next line.
  const separateStreet = street && !normal(instruction).includes(normal(street)) ? street : '';
  return {instruction, street:separateStreet};
}
