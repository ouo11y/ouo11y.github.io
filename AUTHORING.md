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

## Newsletter: The o11y radar

One issue a month, published in the last week of the month, at `src/content/newsletter/<YYYY-MM>.mdx`
(the file name is the URL: `/newsletter/2026-10/`). Its job: an engineer who reads only this each
month still knows what changed in OpenTelemetry and observability, and what to do about it.

**Window.** The calendar month of the issue. Include the last days of the previous month only when
they shaped this month (a release that landed on the 29th, a stable promotion that the press covered
this month); give the real date.

**Sections, always in this order** (`##` headings; skip one only if it is empty, and say so in a line):

1. `## OpenTelemetry`: specification, semantic conventions, Collector, SDKs, governance.
   Start with a `<StabilityMoves>` of everything that changed maturity this month.
2. `## Release radar`: one `<ReleaseRadar>` with the month's notable releases across collector /
   collector-contrib, JS, browser, Java (SDK and agent), Python, Go, .NET, spec, operator, Android,
   Swift. One row per release that matters (not every patch); `change` is the one thing a user must
   know; `kind` marks major, stable, breaking or security.
3. `## Client-side and RUM`: Browser SIG, web vitals, sessions, mobile.
4. `## Vendors`: Grafana, Datadog, Honeycomb, Elastic, Splunk, Dynatrace, New Relic, Sentry,
   Embrace, Chronosphere and others. Only what the vendor itself announced (press release, blog,
   changelog). No adjectives from press releases, no pricing analysis, no predictions.
5. `## Community and events`: dates, places, calls for papers, elections.
6. `## Reading list`: three to eight posts from elsewhere, each summarised in two sentences of
   our own words, with author and date.
7. `## From ouo11y`: our posts and announcements of the month. Last and short.

**Every item is an `<Item>`** (`src/components/newsletter/Item.astro`): `title`, `label`
(stable, breaking, release, security, new, deprecation, event, read, vendor, ours), `date` of the
event, the slot says *what happened* in two to four sentences, `why` says why it matters to someone
running OpenTelemetry, `todo` says what to do (or "Nothing yet; watch X"), `sources` links the
primary source(s), `deeper` links our own posts that go further. Give every item an `id`; the
`inThisIssue` lines link to them.

**Front matter:**

```yaml
---
title: "The o11y radar #2, November 2026: <the two biggest headlines>"
description: One sentence for the archive, link previews and RSS.
date: 2026-11-27
issue: 2
tags: [opentelemetry, vendors, newsletter]
inThisIssue:            # 5 to 8 lines, the issue's headlines, each linking to an item
  - text: "OTTL is v1: your `transform` rules sit on a stable language"
    href: "#ottl-v1"
---
```

**Sourcing.** A claim without a primary source is not published. Primary means: the project's
GitHub release or CHANGELOG, the spec or semconv repo, opentelemetry.io/blog, the vendor's own press
release or changelog, the event's official page. Secondary coverage (InfoQ, The New Stack) can be a
second link, never the only one. Check every version and date with `gh`:

```bash
gh release list -R open-telemetry/opentelemetry-collector-contrib -L 10
```

```bash
gh release view v0.164.0 -R open-telemetry/opentelemetry-collector-contrib
```

Repos to scan each month: opentelemetry-collector, -collector-contrib, -collector-releases,
-specification, semantic-conventions, semantic-conventions-client-side, -proto, -js, -js-contrib,
-browser, -java, -java-instrumentation, -python, -python-contrib, -go, -go-contrib, -dotnet,
-dotnet-instrumentation, -operator, -helm-charts, -android, -swift, -configuration,
-ebpf-profiler (all under `open-telemetry/`), plus https://opentelemetry.io/blog/.

**Writing.** Same rules as the rest of the site: plain words, our own summaries, at most one short
quote per issue, no copied text from vendors or other blogs. Fair to every vendor, including
ouo11y. Never put business material (pricing, customers, prospects, plans) in an issue. If you
could not confirm something, leave it out; if you got something wrong after publishing, fix it in
place, set `updated:` and add a `<Note type="caution" title="Correction">` at the top.

**Visuals.** At least one HTML/CSS/JS visual per issue; `<ReleaseRadar>` and `<StabilityMoves>`
(`src/components/newsletter/`) are the default pair. Any component from `src/components/diagrams/`
works too.

**Follow block.** `src/components/newsletter/Follow.astro` is the only place that says how to
subscribe (RSS today, email on request). When a mailing list provider exists, replace its "Email
edition" block with the provider's form; the landing page and every issue pick it up.

**Check.** `npm run build`, then the issue and `/newsletter/` at desktop and 375 px, light and dark,
no horizontal scroll, and `/newsletter/rss.xml` lists the new issue. Open every source link once.
