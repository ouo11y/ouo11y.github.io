import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Blog, newsletter and announcements share one frontmatter shape.
const post = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  authors: z.array(z.string()).default(['ouo11y team']),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const posts = (dir: string) =>
  defineCollection({ loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: `./src/content/${dir}` }), schema: post });

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  blog: posts('blog'),
  newsletter: posts('newsletter'),
  announcements: posts('announcements'),
};
