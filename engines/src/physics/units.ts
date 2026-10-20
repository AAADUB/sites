export const KW_TO_HP = 1.341;

/** P[kW] = T[N·m]·rpm / 9549 */
export const powerKw = (torqueNm: number, rpm: number): number => (torqueNm * rpm) / 9549;
export const kwToHp = (kw: number): number => kw * KW_TO_HP;
export const hpToKw = (hp: number): number => hp / KW_TO_HP;
export const ccToLitres = (cc: number): number => cc / 1000;
export const kelvinToC = (k: number): number => k - 273.15;
export const barToKpa = (bar: number): number => bar * 100;

export type Lang = 'en' | 'ru';

const NNBSP = ' '; // narrow no-break space (Russian thousands separator)

/** Locale-aware number formatting: Russian uses decimal comma and thin-space thousands. */
export function fmt(value: number, lang: Lang, digits = 0): string {
  if (!Number.isFinite(value)) return '–';
  const fixed = Math.abs(value).toFixed(digits);
  const [intPart, frac] = fixed.split('.');
  const sep = lang === 'ru' ? NNBSP : ',';
  const grouped = intPart.length > 3 ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : intPart;
  const dec = lang === 'ru' ? ',' : '.';
  const sign = value < 0 ? '−' : '';
  return sign + grouped + (frac ? dec + frac : '');
}

export const UNIT: Record<Lang, Record<string, string>> = {
  en: { kW: 'kW', hp: 'hp', Nm: 'N·m', rpm: 'rpm', bar: 'bar', cc: 'cm³', L: 'L', mm: 'mm', deg: '°', C: '°C', pct: '%', s: 's', kmh: 'km/h' },
  ru: { kW: 'кВт', hp: 'л. с.', Nm: 'Н·м', rpm: 'об/мин', bar: 'бар', cc: 'см³', L: 'л', mm: 'мм', deg: '°', C: '°C', pct: '%', s: 'с', kmh: 'км/ч' },
};

/** "120 kW" with a no-break space between number and unit */
export function withUnit(value: number, unit: string, lang: Lang, digits = 0): string {
  const u = UNIT[lang][unit] ?? unit;
  if (unit === 'deg') return fmt(value, lang, digits) + u;
  return fmt(value, lang, digits) + ' ' + u;
}
