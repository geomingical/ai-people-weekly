import type { FilterState } from './filters';
import { serializeFilterState } from './filters';
import type { Locale } from './story';

/** Route prefix for a locale. zh-TW is the default and carries no prefix. */
export function localePrefix(locale: Locale): string {
  return locale === 'en' ? '/en' : '';
}

export function localizedPath(
  locale: Locale,
  path: string,
  state?: FilterState,
): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const full = `${localePrefix(locale)}${normalized}`;
  if (!state) return full;
  const query = serializeFilterState(state).toString();
  return query ? `${full}?${query}` : full;
}

/**
 * The same page in the other language. A path under /en/ maps to the same path
 * without the prefix; anything else maps to /en + path.
 */
export function counterpartPath(pathname: string): string {
  const isEnglish = pathname === '/en' || pathname.startsWith('/en/');
  if (!isEnglish) return `/en${pathname}`;
  return pathname === '/en' ? '/' : pathname.slice(3);
}
