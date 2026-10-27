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
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
