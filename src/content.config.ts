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
  // A series groups posts that build on each other: same `series` title, `part` 1, 2, 3...
  series: z.string().optional(),
  part: z.number().int().positive().optional(),
  updated: z.coerce.date().optional(),
  // The blog index shows the newest featured post first; without one, the newest post.
  featured: z.boolean().default(false),
  // Newsletter only: the issue number, and the "In this issue" lines (shown atop the issue and on /newsletter/).
  issue: z.number().int().positive().optional(),
  inThisIssue: z.array(z.object({ text: z.string(), href: z.string() })).optional(),
  // Announcements only: the badge and filter on /announcements/ (AUTHORING.md, "Announcements").
  kind: z.enum(['release', 'notice', 'docs', 'site']).optional(),
});

const posts = (dir: string) =>
  defineCollection({ loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: `./src/content/${dir}` }), schema: post });

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  blog: posts('blog'),
  newsletter: posts('newsletter'),
  announcements: posts('announcements'),
};
