import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { listPosts, sections } from '../../lib/site';

export async function GET(context: APIContext) {
  const entries = await listPosts('announcements');
  return rss({
    title: `ouo11y ${sections.announcements.title.toLowerCase()}`,
    description: sections.announcements.blurb,
    site: context.site!,
    items: entries.filter((e) => !e.data.draft).map((e) => ({
      title: e.data.title,
      description: e.data.description,
      pubDate: e.data.date,
      link: `/announcements/${e.id}/`,
      categories: e.data.tags,
    })),
  });
}
