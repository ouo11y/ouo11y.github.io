# Quickstarts

| File | What |
|---|---|
| [README.md](README.md) | the quickstarts for readers, and how to run one |
| [check-embeds.mjs](check-embeds.mjs) | keeps files embedded in the guides identical to their repo source (CI) |
| [tiny-shop/](tiny-shop/README.md) | Express API + React app traced end to end; [build-it-yourself guide](tiny-shop/build-it-yourself-guide.md) |
| [tiny-shop-otel/](tiny-shop-otel/README.md) | [build-it-yourself guide](tiny-shop-otel/build-it-yourself-guide.md); Tiny Shop without the ouo SDK: OpenTelemetry JS + rrweb + web-vitals in the browser, and the contract ouo needs from a browser. **The reference quickstart for the rules below** |
| [tiny-shop-funnels/](tiny-shop-funnels/README.md) | [build-it-yourself guide](tiny-shop-funnels/build-it-yourself-guide.md); quickstart 5: shop pages and custom events as a funnel, 50 generated sessions, drop-off to replay (rum-api and Grafana built from source until the next release) |

## Rules for every quickstart

Every new quickstart follows these rules, and a change to an existing one brings it closer to
them. [tiny-shop-otel](tiny-shop-otel/build-it-yourself-guide.md) is the first quickstart that
follows all of them: when a rule is unclear, do what it does.

### 1. Shape

```
examples/quickstarts/<name>/
├── README.md                  what it shows, how to run result/ as is, ports, things that bite
├── build-it-yourself-guide.md the main path: build the app by hand, one step at a time
├── files/                     optional: files too many to embed (rare)
└── result/                    exactly what the guide ends with
    ├── stack/                 the ouo stack, one folder per service (rule 3)
    ├── backend/
    └── frontend/
```

- **The guide is the quickstart.** It starts from an empty folder and writes every file by hand:
  the plain app first, with no telemetry, then the stack, then the instrumentation. Each step ends
  with something the reader can see (a page, a trace, a log line, a session). It ends with
  clean-up and a "When something does not work" table.
- **The guide opens with a folder tree** of `<name>/` and the time it takes.
- **`result/` runs on its own**, inside or outside this repo, and the README runs it for readers
  who skip the guide.

### 2. Paths and commands

- **No absolute or home paths.** Never `~/Desktop/...` or `cd ~/...`. The reader creates
  `<name>/` wherever they keep projects, with one command:
  `mkdir -p <name>/backend <name>/stack` (the frontend folder is created by its scaffolder).
- **Every path is relative to `<name>/`**, and every command says which of its folders it runs
  in: "In the backend tab, from `<name>/backend`". Terminal tabs open in `<name>/`, so a step
  starts with `cd backend` or `cd stack`, never a long path.
- **One command per fenced `bash` block**, no `$` prompt, no output inside the block.
- **"Replace the file"** means select all and paste; say it once at the top of the guide.

### 3. The stack: one folder per service

- **`result/stack/`**, never the one-file `deploy/compose/quickstart.yaml`. Folders are numbered
  in start order: `10-collector`, `20-tempo`, `30-loki`, `40-mimir`, `50-rum-api`, `60-grafana`.
  Each holds that service's `compose.yaml` and its config.
- **The top `compose.yaml` only `include:`s the folders**, one line each with a comment saying
  what the service is for.
- **Every file starts with a comment:** what the service is for, who sends it data, its ports.
- **In the guide, the step is "The stack, one service at a time".** One bold sentence introduces
  each service, then each of its files is its own collapsible block:

  ````markdown
  <details>
  <summary><code>stack/10-collector/compose.yaml</code> (click to open)</summary>

  <!-- embed: examples/quickstarts/<name>/result/stack/10-collector/compose.yaml -->
  ```yaml
  ...
  ```

  </details>
  ````

- **Ports are variables:** `${OUO_GRAFANA_PORT:-3000}`, `${OUO_OTLP_HTTP_PORT:-4318}`,
  `${OUO_REPLAY_PORT:-4319}`, ... Only Grafana and the collector are published to the network;
  Loki, Tempo, Mimir and health ports are bound to `127.0.0.1`. The guide shows how to check the
  ports and move them with `stack/.env`, and never tells the reader to stop what holds a port.
- **Development credentials only** (`demo` / `pt_dev_demo_...`, `admin` / `testing567`), and say
  they are public.

### 4. Image versions

- **ouo images use `:latest`**, which follows each release:
  `ghcr.io/ouo11y/{collector,rum-api,grafana}:latest`.
- **Above each ouo `image:` line, a comment names the tested version and its digest**, and how to
  pin: `rum-api:0.5.0` or `rum-api@sha256:...`. The configs in `stack/` are written for those
  tested versions. When you bump them, rerun `result/` and update the comments.
- **Upstream images are pinned exactly** (`grafana/loki:3.7.7`, `grafana/tempo:3.0.3`,
  `grafana/mimir:3.2.1`).
- **The troubleshooting table has a row for a newer `latest`** that rejects a config: read
  `docker compose logs <service>`, pin the tested version.
- **Build from source only for a feature that is not released yet**, and say so in the compose
  comment, with the `image:` line that replaces `build:` once it ships (tiny-shop-funnels does this).

### 5. Packages and libraries

- **Every package the reader installs is explained** in a table: the package and what it does in
  this app.
- **When names are close or some are deprecated, add a collapsible "which package is which"**
  with each one's status (current, deprecated, experimental, does not exist) and why this guide
  picked the one it uses. tiny-shop-otel step 6 is the model.
- **No deprecated package when a working replacement exists.** Check the package's README, not
  only npm: `@opentelemetry/instrumentation-fetch` is deprecated in its README and not on npm.
- **Published things only:** released images and npm packages, never "clone the repo and build
  the SDK". `result/` installs the published ouo packages, not the workspace sources.
- **Every new dependency has a one-line reason** in the agent summary (AGENTS.md).

### 6. Readable telemetry

- **Log records have a human `body`.** A Loki line must say what happened without opening the
  attributes: `GET http://localhost:5001/api/fail 500`, `LCP 176 ms good`, not an empty line.
- **Names follow the ouo contract and OpenTelemetry semantic conventions**; ouo's own attributes
  are prefixed `ouo.`.

### 7. Copies of repo files are checked, never edited by hand

The `<!-- embed: <repo path> -->` line right before a fenced block makes
[`check-embeds.mjs`](check-embeds.mjs) fail CI when the block differs from that file. Edit the file
in `result/`, then refresh every guide:

```bash
node examples/quickstarts/check-embeds.mjs --write
```

An intermediate version of a file (a first `index.js` that a later step replaces) is written in
the guide without a marker, and checked by building it once.

### 8. Trade-offs, when the quickstart is an alternative

A quickstart that shows a way around an ouo component (no SDK, another collector, another store)
ends with what the reader does not get, and what it costs to add each piece: easy, medium, hard,
or needs a server, with a line count. tiny-shop-otel step 8 is the model.

### 9. Verified before the PR

- Run `result/` against `result/stack/` as an **isolated compose project on shifted ports**
  (`docker compose -p <name>-verify ...`, `OUO_*_PORT` set), with the `latest` images pulled that
  day.
- Click through the app (headless Chromium is fine) and check each signal where the reader will
  look: the Loki lines, the trace in Tempo, the session in ouo11y RUM.
- Build the guide's intermediate files once; run `check-embeds.mjs` and lychee.
- Record what was checked, and the image versions and digests, in the agent summary. Then tear the
  project down, or name it and its URL in the summary if it stays up.

### Where each quickstart stands

| Quickstart | Follows the rules | Still to change |
|---|---|---|
| [tiny-shop-otel](tiny-shop-otel/README.md) | all (reference) | nothing |
| [tiny-shop-funnels](tiny-shop-funnels/README.md) | stack folders | `~/Desktop` paths (2); collector pinned to 0.4.0 instead of `latest` with a tested-version comment (4); rum-api and Grafana from source until funnels are released (4, allowed) |
| [tiny-shop](tiny-shop/README.md) | shape, embeds | one-file `quickstart.yaml` stack (3, 4); `~/Desktop` paths (2) |
