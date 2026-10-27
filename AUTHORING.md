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
