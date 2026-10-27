# ouo11y.com

The ouo11y website: landing page, docs, blog, newsletter and announcements. Astro with Starlight
for the docs, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

```bash
npm install
```

```bash
npm run dev        # http://localhost:4321, drafts included
```

```bash
npm run build      # dist/, what Pages serves
```

## Where things live

| Path | What |
|---|---|
| `src/pages/index.astro` | the landing page |
| `src/content/docs/docs/` | docs pages (Starlight), served under `/docs/`; the sidebar is in `astro.config.mjs` |
| `src/content/blog/` | know-how, tips and tricks |
| `src/content/newsletter/` | the monthly o11y radar: OpenTelemetry and vendor news, every item with a source link |
| `src/content/announcements/` | ouo11y releases and news |
| `src/lib/site.ts` | site name, contact emails, section blurbs |
| `public/CNAME` | the custom domain, `ouo11y.com` |

## Write a post

Add a Markdown file to `blog/`, `newsletter/` or `announcements/` under `src/content/`. The file
name is the URL slug.

```md
---
title: "Tip: redact once, at the collector"
description: One sentence for the list page, RSS and link previews.
date: 2026-11-02
tags: [collector, tips]
draft: true        # shown by `npm run dev`, left out of the build; remove to publish
---
```

Each section has an RSS feed at `/<section>/rss.xml`.

## Rules for content

- Every news item in the newsletter links to its primary source. No unsourced claims.
- Use OpenTelemetry names; an `ouo.` attribute is described as waiting for an OTel convention.
- Write `ouo11y` lowercase, always.
