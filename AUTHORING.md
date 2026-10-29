# Writing for ouo11y.com

The bar: a reader who has never seen our GitHub repo can follow every page on this site from
start to finish, copy every file from the page, and end with the thing the page promised. If a
page needs the repo to make sense, it is not done.

## Rules

1. **Everything on the site.** Never send readers to GitHub to read a guide or copy a file. Embed
   the file with `<QuickstartFile>`, offer the finished folder with `<Download>`. The product repo
   is private for now; a repo path may appear only as a credit, never as the instructions.
2. **Diagrams are HTML, CSS and JS.** Use the components below, or write a new one in
   `src/components/diagrams/`. No ASCII art, no image files, no Mermaid.
3. **Every claim is checkable.** Commands are copy-paste ready, one per `bash` block, no `$`
   prompt. Each step ends with something the reader sees (a page, a trace, a log line, a session)
   and says what it looks like.
4. **OpenTelemetry names first.** An `ouo.` attribute is described as waiting for an OTel
   convention (`/docs/concepts/semantic-conventions/`).
5. **`ouo11y`, lowercase, always.** "ouo" for the short internal name in code.
6. **Plain words.** Short sentences. No "simply", "just", "easily", "seamless", "powerful".

## Components (MDX)

Import paths are relative to the page, e.g. from `src/content/docs/docs/quickstarts/x.mdx`:
`../../../../components/...`.

| Component | Use |
|---|---|
| `diagrams/Flow.astro` | columns of boxes joined by arrows: architecture, data flow |
| `diagrams/Sequence.astro` | who calls whom, in order, with a Play button |
| `diagrams/Timeline.astro` | one session as a waterfall of events and spans |
| `QuickstartFile.astro` | embeds `quickstarts/<qs>/<path>` as a code block with its path as title |
| `Download.astro` | links `/downloads/<qs>.zip`, the quickstart's `result/` zipped at build |
| Starlight `Steps`, `Tabs`, `Aside`, `FileTree`, `Code` | from `@astrojs/starlight/components` |

`src/content/docs/docs/concepts/architecture.mdx` uses all three diagrams: copy from it.

## Quickstart sources

`quickstarts/<name>/` holds a copy of `examples/quickstarts/<name>/` from the product repo
(`ouo11y/ouo11y`): `build-it-yourself-guide.md`, `README.md`, `result/`. The site pages in
`src/content/docs/docs/quickstarts/` are written from them. `scripts/zip-quickstarts.mjs` zips
each `result/` into `public/downloads/` before every build. To refresh the copies from a
checkout of the product repo, copy `examples/quickstarts/<name>/` over `quickstarts/<name>/`.

## Check before you push

```bash
npm run build
```

Then `npx astro preview` and look at every page you changed at desktop width and at 375 px
(no horizontal scroll), in light and dark.

## Blog posts

The blog's job is to bring people here for knowledge they cannot get as well anywhere else.
A post earns its place when a reader finishes it able to do something new, and trusts us more.

- **Hands-on, and run before it is published.** Every command, config and number in a post was
  run or measured by the author on a real setup (kind/minikube, Docker Compose, the ouo11y
  stack). Say what you ran it on and which versions. If you could not run something, say so in
  the post; never present untested config as working.
- **History and why, then how.** Explain where a thing came from (the spec, the SIG, the
  incident that motivated it) before the steps. Link primary sources: specs, PRs, release notes,
  meeting notes, papers.
- **Visual.** At least one interactive or HTML/CSS diagram or chart per post where it helps
  (`src/components/diagrams/`, including `Chart.astro` for line and area charts). Calculators
  and sliders are welcome when the topic is numbers.
- **Copyright.** Never reproduce text, figures or examples from books, paid courses or other
  blogs. Summarise in your own words, credit the source, quote at most one short sentence.
  Write your own examples.
- **Vendor-neutral and fair.** Compare tools on facts with sources. Say what the open-source
  version of a product can and cannot do.
- **Series.** Posts that build on each other share a `series:` title and a `part:` number;
  the site builds the series page, the in-post series box and part-to-part navigation.

Front matter:

```yaml
---
title: "Kubernetes observability without a vendor, part 1: the blueprint"
description: One or two sentences for the list page, link previews and RSS.
date: 2026-11-02
tags: [kubernetes, collector, hands-on]
series: "Kubernetes observability without a vendor"   # optional
part: 1                                               # with series
authors: ["ouo11y team"]                              # optional
updated: 2026-11-05                                   # optional
---
```

Posts live in `src/content/blog/<slug>.mdx` (or `.md`); the file name is the URL. Components
for posts: everything in `src/components/diagrams/`, and `src/components/Note.astro` for
callouts (Starlight's `Aside` is styled only inside the docs). Do not import
Starlight's `Code` (or `QuickstartFile`, which uses it) into a post: it loads Starlight's
dark-default theme and turns every diagram on the page dark in light mode. Use
`astro-expressive-code/components` instead, as `src/components/E2eFile.astro` does. Set
`featured: true` on the one post the blog index should lead with. Import paths from a post:
`../../components/...`.

## Announcements

`/announcements/` is where a user checks what ouo11y shipped, which versions to run together
and how to upgrade. It has three parts, built from two sources:

- **Current versions** and the **release timeline** read `src/data/releases.ts`: every package
  (`packages`), every released version (`releases`), the release trains that group them
  (`trains`), and the non-release events flagged on the timeline (`milestones`).
- **The list** reads `src/content/announcements/`, newest first, grouped by month, with a badge
  and filter from the `kind:` front matter field: `release`, `notice` (a change that is not a
  release, such as the rename), `docs` or `site`.

### Where facts come from

Every fact in an announcement or in `releases.ts` must be in one of these. Never write a
feature from a commit title or a guess, and never announce what is planned.

| Fact | Source |
|---|---|
| version, time, image digest, what changed | `gh release view <tag> -R ouo11y/ouo11y`, and the package's own `CHANGELOG.md` on the product repo's `main` |
| npm publish time | `npm view @ouo11y/<package> time --json` |
| which versions work together (`needs`) | `docs/compatibility.md` on the product repo's `main` |
| upgrade steps | `docs/operations/upgrade.md`, retold for the site's own stack in `/docs/operate/upgrade/` |

Dates are UTC: the GitHub release time, or the npm publish time when that is later. The post's
`date:` is the day of the last release in its train.

### Adding a release

1. In `src/data/releases.ts`, add one `releases` entry per released version: package, version,
   `at` (UTC), `train`, `tagged`, `image` and `digest` for images, `plugin` for the grafana image,
   `needs` copied from the compatibility matrix, and a `note` of one line saying what a user gets.
   Versions released together share a train; add the train to `trains` with the id of its
   announcement. The landing's current versions and timeline update from this alone.
2. Write the announcement: `src/content/announcements/<YYYY-MM-DD>-<slug>.mdx`, `kind: release`.
3. Update the version tables in `/docs/` that name current versions (`/docs/`, "What is released
   today"; `/docs/operate/upgrade/`; `/docs/start/quickstart/`, "Versions").

### The format of a release announcement

Sections, in this order; leave out one that has nothing to say:

1. One paragraph: what was released together, and on which days.
2. `<ReleaseTable train="<id>" />` from `src/components/announcements/`: each version, the one
   before it, where to get it, what it needs, the digest.
3. **What is new**, grouped by who notices it (operators, the session page, SDK users), in plain
   user-facing words. Not a commit list: say what someone can now do or see.
4. **Get it**: copy-paste commands, one per block. Images are private during early access; say so
   and link `/docs/start/quickstart/#before-you-start`.
5. **Upgrade**: the order, anything that changes behaviour on upgrade (a new default, a header the
   collector must allow, a renamed setting), and a link to `/docs/operate/upgrade/`.
6. **Which versions work together**, in a `Note`.

Link to pages on this site (`/docs/...`), never to the product repository. When an announcement
and a docs page disagree, say so in the announcement and name the page. A correction to a
published announcement gets `updated:` and a short "Corrected on" note; if the date in its file
name changes, add the old URL to `redirects` in `astro.config.mjs`.
