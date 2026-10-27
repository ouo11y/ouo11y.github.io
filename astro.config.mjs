// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ouo11y.com',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'ouo11y',
      description: 'Docs for ouo11y, Open Unified Observability: OpenTelemetry-native RUM, with or without our SDK.',
      logo: { src: './public/logo.svg', replacesTitle: false },
      favicon: '/logo.svg',
      customCss: ['./src/styles/starlight.css'],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/ouo11y' },
        { icon: 'rss', label: 'Blog RSS', href: 'https://ouo11y.com/blog/rss.xml' },
      ],
      editLink: { baseUrl: 'https://github.com/ouo11y/ouo11y.github.io/edit/main/' },
      lastUpdated: true,
      components: { SocialIcons: './src/components/DocsNav.astro' },
      sidebar: [
        { label: 'Overview', link: '/docs/' },
        { label: 'Start here', items: [{ autogenerate: { directory: 'docs/start' } }] },
        { label: 'Quickstarts', items: [{ autogenerate: { directory: 'docs/quickstarts' } }] },
        { label: 'Instrument', items: [{ autogenerate: { directory: 'docs/instrument' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'docs/concepts' } }] },
        { label: 'Operate', items: [{ autogenerate: { directory: 'docs/operate' } }] },
      ],
    }),
    sitemap(),
  ],
});
