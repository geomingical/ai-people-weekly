// Browser-side filtering. Progressive enhancement only: every story is already
// server-rendered and every link already works, so with JavaScript disabled the
// page simply does not narrow. Nothing here fetches, and nothing here is
// required for the content to be readable.

import {
  applyFilters,
  defaultFilterState,
  parseFilterState,
  serializeFilterState,
  type FilterState,
  type StoryRow,
} from '../domain/filters';
import { countText } from '../domain/format';
import { messages, type MessageKey } from '../domain/i18n';
import type { Locale } from '../domain/story';

const root = document.querySelector<HTMLElement>('[data-issue-root]');
const dataNode = document.querySelector<HTMLScriptElement>('#story-data');

function translate(locale: Locale, key: MessageKey): string {
  return messages[key][locale];
}

function readRows(): StoryRow[] {
  if (!dataNode?.textContent) return [];
  try {
    const parsed: unknown = JSON.parse(dataNode.textContent);
    return Array.isArray(parsed) ? (parsed as StoryRow[]) : [];
  } catch {
    // Malformed island data must not break a page that already renders every
    // story server-side; filtering degrades, reading does not.
    return [];
  }
}

function readLocale(): Locale {
  return root?.dataset.locale === 'en' ? 'en' : 'zh-tw';
}

if (root && dataNode) {
  const locale = readLocale();
  const rows = readRows();
  const form = root.querySelector<HTMLFormElement>('[data-filter-form]');
  const list = root.querySelector<HTMLElement>('[data-results-list]');
  const countNode = root.querySelector<HTMLElement>('[data-result-count]');
  const emptyNode = root.querySelector<HTMLElement>('[data-empty-state]');

  const elementById = new Map<string, HTMLElement>();
  list?.querySelectorAll<HTMLElement>('[data-story-id]').forEach((node) => {
    const id = node.dataset.storyId;
    if (id) elementById.set(id, node);
  });

  const render = (state: FilterState) => {
    const visible = applyFilters(rows, state);
    const visibleIds = new Set(visible.map((row) => row.story.id));

    elementById.forEach((node, id) => {
      node.hidden = !visibleIds.has(id);
    });

    // Reorder to match the filtered sort, so the DOM order and the sort rule
    // never disagree after a filter change.
    if (list) {
      for (const row of visible) {
        const node = elementById.get(row.story.id);
        if (node) list.append(node);
      }
    }

    if (countNode) {
      countNode.textContent = countText(locale, 'resultsCountTemplate', visible.length);
    }
    if (emptyNode) {
      emptyNode.hidden = visible.length !== 0;
      emptyNode.textContent = translate(locale, 'resultsEmpty');
    }
  };

  const readState = (): FilterState => {
    if (!form) return defaultFilterState;
    const data = new FormData(form);
    return parseFilterState(
      new URLSearchParams({
        topic: String(data.get('topic') ?? 'all'),
        category: String(data.get('category') ?? 'all'),
        region: String(data.get('region') ?? 'all'),
        q: String(data.get('query') ?? ''),
      }),
    );
  };

  const sync = () => {
    const state = readState();
    render(state);
    const query = serializeFilterState(state).toString();
    window.history.replaceState(
      null,
      '',
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  };

  form?.addEventListener('input', sync);
  form?.addEventListener('change', sync);
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    sync();
  });

  // Apply any filter state carried in the URL so a shared link opens filtered.
  const initial = parseFilterState(window.location.search);
  if (form) {
    const setValue = (name: string, value: string) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLSelectElement || field instanceof HTMLInputElement) {
        field.value = value;
      }
    };
    setValue('topic', initial.topic);
    setValue('category', initial.category);
    setValue('region', initial.region);
    setValue('query', initial.query);
  }
  render(initial);

  // The language link must carry the reader's filters across the switch,
  // otherwise changing language silently resets what they were looking at.
  const languageLink = document.querySelector<HTMLAnchorElement>('[data-language-link]');
  if (languageLink) {
    const query = serializeFilterState(initial).toString();
    if (query) languageLink.href = `${languageLink.pathname}?${query}`;
  }
}
