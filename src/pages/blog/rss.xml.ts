import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { listPosts, sections } from '../../lib/site';

export async function GET(context: APIContext) {
  const entries = await listPosts('blog');
  return rss({
    title: `ouo11y ${sections.blog.title.toLowerCase()}`,
    description: sections.blog.blurb,
    site: context.site!,
    items: entries.filter((e) => !e.data.draft).map((e) => ({
      title: e.data.title,
      description: e.data.description,
      pubDate: e.data.date,
      link: `/blog/${e.id}/`,
      categories: e.data.tags,
    })),
  });
}
