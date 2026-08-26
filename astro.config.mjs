import { defineConfig } from 'astro/config';

export default defineConfig({
  // GitHub Pages project site: the pages live under /<repo>/, so every
  // internal link needs that prefix. `src/lib/paths.ts` is the single place
  // that adds it — see the note there before changing this.
  site: 'https://geomingical.github.io',
  base: '/ai-people-weekly',
  output: 'static',
  i18n: {
    locales: ['zh-tw', 'en'],
    defaultLocale: 'zh-tw',
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
      fallbackType: 'redirect',
    },
  },
});
