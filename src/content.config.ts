import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { storySchema } from './domain/story';
import { sourceSchema } from './domain/source';

// Both collections are validated at build time. Invalid data fails the build
// rather than reaching a page, which is what lets the site skip runtime error
// states entirely: nothing invalid can be shipped.
const stories = defineCollection({
  loader: file('src/data/stories.json'),
  schema: storySchema,
});

const sources = defineCollection({
  loader: file('src/data/sources.json'),
  schema: sourceSchema,
});

export const collections = { stories, sources };
