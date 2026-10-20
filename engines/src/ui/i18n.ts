import type { Lang } from '../physics/units';

/** Runtime strings are embedded in the page as JSON by the build (see content/render.ts). */
type Dict = Record<string, unknown>;

let data: Dict = {};
let lang: Lang = 'en';

export function initI18n() {
  lang = (document.documentElement.lang === 'ru' ? 'ru' : 'en') as Lang;
  const el = document.getElementById('ic-data');
  try {
    data = el ? (JSON.parse(el.textContent || '{}') as Dict) : {};
  } catch {
    data = {};
  }
}

export const getLang = () => lang;

/** Look up a dotted key, e.g. t('ui.explore'). Supports {name} interpolation. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let cur: unknown = data;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Dict)) cur = (cur as Dict)[part];
    else return key;
  }
  let s = typeof cur === 'string' ? cur : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function tget<T = unknown>(key: string): T | undefined {
  let cur: unknown = data;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Dict)) cur = (cur as Dict)[part];
    else return undefined;
  }
  return cur as T;
}
