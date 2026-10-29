import { getCollection, type CollectionEntry } from 'astro:content';

export const site = {
  name: 'ouo11y',
  tagline: 'Open Unified Observability',
  github: 'https://github.com/ouo11y',
  repo: 'https://github.com/ouo11y/ouo11y',
  // Shown on the site. Placeholders until the mailboxes are set up.
  email: {
    hello: 'hello@ouo11y.com',
    security: 'security@ouo11y.com',
    news: 'news@ouo11y.com',
  },
};

export type Section = 'blog' | 'newsletter' | 'announcements';

export const sections: Record<Section, { title: string; blurb: string }> = {
  blog: {
    title: 'Blog',
    blurb: 'Know-how, tips and tricks for OpenTelemetry, RUM and the LGTM stack. Written by the people who hit the problems first.',
  },
  newsletter: {
    title: 'Newsletter',
    blurb: 'The o11y radar: what changed in OpenTelemetry and across observability vendors, and why it matters to you. Monthly, with sources.',
  },
  announcements: {
    title: 'Announcements',
    blurb: 'Releases and news from ouo11y itself.',
  },
};

export async function listPosts(section: Section): Promise<CollectionEntry<Section>[]> {
  const entries = await getCollection(section, ({ data }) => import.meta.env.DEV || !data.draft);
  // Newest first; posts of one day keep their series together, in part order.
  return entries.sort((a, b) =>
    b.data.date.valueOf() - a.data.date.valueOf() ||
    (a.data.series ?? '').localeCompare(b.data.series ?? '') ||
    (a.data.part ?? 0) - (b.data.part ?? 0));
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

// Minutes at 230 words a minute, code and MDX imports included in the count.
export const readingTime = (body = '') => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 230));

export interface Series { title: string; slug: string; posts: CollectionEntry<Section>[]; }

export function seriesIn(entries: CollectionEntry<Section>[]): Series[] {
  const map = new Map<string, Series>();
  for (const e of entries) {
    if (!e.data.series) continue;
    const slug = slugify(e.data.series);
    if (!map.has(slug)) map.set(slug, { title: e.data.series, slug, posts: [] });
    map.get(slug)!.posts.push(e);
  }
  for (const s of map.values()) s.posts.sort((a, b) => (a.data.part ?? 0) - (b.data.part ?? 0) || a.data.date.valueOf() - b.data.date.valueOf());
  return [...map.values()];
}

// "Series name, part 2: the topic" → "the topic", for lists that already show the series.
export function shortTitle(title: string, series?: string) {
  if (!series || !title.startsWith(series)) return title;
  const rest = title.slice(series.length).replace(/^[,:]?\s*part \d+\s*[:,-]?\s*/i, '');
  return rest ? rest[0].toUpperCase() + rest.slice(1) : title;
}
