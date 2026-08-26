// The one place that knows the site is served from a sub-path.
//
// GitHub Pages serves a project site at `https://<user>.github.io/<repo>/`, so
// every internal link needs that prefix. `src/domain/locale.ts` stays pure and
// framework-free — it returns site-root-relative paths, and its tests can check
// them without knowing where the site is deployed. This adapter is the thin
// boundary layer that turns those into real hrefs.
//
// Moving to a custom domain later means setting `base` back to '/' in
// astro.config.mjs. Nothing here or in any component has to change.

import { counterpartPath as pureCounterpart, localizedPath as pureLocalizedPath } from '../domain/locale';
import type { FilterState } from '../domain/filters';
import type { Locale } from '../domain/story';

/** '' when deployed at a domain root, '/ai-education-weekly' on Pages. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function withBase(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${normalized}`;
}

/**
 * Removes the deployment prefix from a real request path, so the pure locale
 * helpers see the same site-root-relative path they were written against.
 */
export function stripBase(pathname: string): string {
  if (BASE.length === 0) return pathname;
  if (pathname === BASE) return '/';
  return pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) : pathname;
}

/** A ready-to-use href for an internal page. */
export function sitePath(locale: Locale, path: string, state?: FilterState): string {
  return withBase(pureLocalizedPath(locale, path, state));
}

/** The same page in the other language, as a ready-to-use href. */
export function counterpartHref(pathname: string): string {
  return withBase(pureCounterpart(stripBase(pathname)));
}
