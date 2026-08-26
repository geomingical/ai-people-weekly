import { z } from 'astro/zod';

// One record = one published item from one source, as it appeared in that
// source's feed. The original title and the original summary are stored
// verbatim and never overwritten: the Chinese fields sit BESIDE them, so a
// wrong machine translation can always be checked against what the source
// actually said.
//
// Deliberately absent, reserved for later phases: full article body (we link,
// we do not republish), author, image, per-story reader notes, related-story
// links. Add them as new optional fields; never rename a field to repurpose it.

export const TOPICS = [
  'policy',      // 政策法規 — government, regulator, ministry, EU AI Act
  'k12',         // 中小學
  'higher-ed',   // 高等教育
  'teaching',    // 教學實務 — classroom practice, teacher training
  'tools',       // 工具與產品 — vendor product/programme launches
  'research',    // 研究 — papers, studies, evaluations
  'integrity',   // 學術誠信 — cheating, detection, assessment redesign
  'workforce',   // 人才培育 — skills, curricula, certification, jobs
] as const;

export const LANGUAGES = ['en', 'zh-tw', 'zh-cn', 'other'] as const;

export const storySchema = z
  .object({
    // sha-256 of the canonical URL, first 16 hex chars. Stable across runs,
    // so re-fetching the same article never creates a second record.
    id: z.string().regex(/^[a-f0-9]{16}$/),
    sourceId: z.string().regex(/^[a-z0-9-]+$/),

    // Verbatim from the feed. Never machine-edited.
    title: z.string().min(1),
    summaryOriginal: z.string(),

    // Machine-produced, null when no model ran or the model output was
    // rejected. The UI must label these as machine-generated wherever shown.
    titleZhTW: z.string().min(1).nullable().default(null),
    summaryZhTW: z.string().min(1).nullable().default(null),

    // Which summary the UI should present as primary, decided at build time
    // rather than by component logic so the choice is testable.
    summarySource: z.enum(['machine', 'source-verbatim', 'none']),

    // https only: feed content is untrusted, and .url() alone would let a
    // javascript: or data: scheme become a clickable link in the page.
    url: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://'), {
        message: 'story URLs must use https',
      }),

    publishedAt: z.string().datetime({ offset: true }),
    fetchedAt: z.string().datetime({ offset: true }),

    // ISO week the story belongs to, e.g. "2026-W34". Derived from
    // publishedAt at ingest time and frozen, so a story never silently
    // moves between issues on a later run.
    issue: z.string().regex(/^\d{4}-W\d{2}$/),

    topics: z.array(z.enum(TOPICS)).min(1),
    region: z.string().min(2),
    language: z.enum(LANGUAGES),
  })
  .strict()
  .superRefine((story, ctx) => {
    if (story.summarySource === 'machine' && story.summaryZhTW === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'summarySource "machine" requires summaryZhTW',
        path: ['summaryZhTW'],
      });
    }
    if (story.summarySource === 'source-verbatim' && story.summaryOriginal.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'summarySource "source-verbatim" requires a non-empty summaryOriginal',
        path: ['summaryOriginal'],
      });
    }
    if (Date.parse(story.fetchedAt) < Date.parse(story.publishedAt)) {
      ctx.addIssue({
        code: 'custom',
        message: 'fetchedAt must not precede publishedAt',
        path: ['fetchedAt'],
      });
    }
  });

export type Story = z.infer<typeof storySchema>;
export type Topic = (typeof TOPICS)[number];
export type StoryLanguage = (typeof LANGUAGES)[number];
export type Locale = 'zh-tw' | 'en';
