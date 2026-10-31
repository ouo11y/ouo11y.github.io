// Every released version of every ouo11y package, in one place. The announcements landing
// (current versions, release timeline) and the version tables inside announcements read this
// file. AUTHORING.md, "Announcements", says how to add a release.
//
// Sources: `gh release view <tag> -R ouo11y/ouo11y` (time, digest, notes), `npm view
// @ouo11y/<pkg> time --json` (npm publish time), docs/compatibility.md (`needs`).
// Times are UTC, from the GitHub release or the npm publish, whichever is later.

export type PackageId = 'collector' | 'rum-api' | 'grafana' | 'plugin' | 'browser' | 'react-native';
export type Channel = 'npm' | 'ghcr' | 'inside-grafana';

export interface Package {
  id: PackageId;
  name: string;          // as written in prose
  short: string;         // lane label in the timeline
  what: string;
  channel: Channel;
  docs: string;          // a page on this site
  get: (version: string) => string;   // the copy-paste command or the place it ships
}

export const packages: Package[] = [
  {
    id: 'collector', name: 'collector', short: 'collector',
    what: 'The OpenTelemetry Collector distribution at the edge: OTLP, replay and Sentry receivers.',
    channel: 'ghcr', docs: '/docs/operate/collector/',
    get: (v) => `docker pull ghcr.io/ouo11y/collector:${v}`,
  },
  {
    id: 'rum-api', name: 'rum-api', short: 'rum-api',
    what: 'Stores replays, serves sessions, funnels and stacks to Grafana.',
    channel: 'ghcr', docs: '/docs/operate/rum-api/',
    get: (v) => `docker pull ghcr.io/ouo11y/rum-api:${v}`,
  },
  {
    id: 'grafana', name: 'grafana image', short: 'grafana',
    what: 'Grafana with the ouo11y RUM app inside.',
    channel: 'ghcr', docs: '/docs/operate/compose/',
    get: (v) => `docker pull ghcr.io/ouo11y/grafana:${v}`,
  },
  {
    id: 'plugin', name: 'ouo11y RUM app', short: 'Grafana app',
    what: 'The Grafana app plugin `ouo11y-rum-app`: sessions, replay, funnels.',
    channel: 'inside-grafana', docs: '/docs/concepts/sessions/',
    get: (v) => `inside ghcr.io/ouo11y/grafana:${grafanaWithPlugin(v) ?? '…'}`,
  },
  {
    id: 'browser', name: '@ouo11y/browser', short: 'browser',
    what: 'The web SDK: sessions, errors, traces, Web Vitals, rrweb replay.',
    channel: 'npm', docs: '/docs/instrument/ouo-sdk/',
    get: (v) => `npm install @ouo11y/browser@${v}`,
  },
  {
    id: 'react-native', name: '@ouo11y/react-native', short: 'react-native',
    what: 'The React Native and Expo SDK, with native replay on iOS.',
    channel: 'npm', docs: '/docs/instrument/react-native/',
    get: (v) => `npm install @ouo11y/react-native@${v}`,
  },
];

export const channels: Record<Channel, { label: string; note: string }> = {
  npm: { label: 'npm, public', note: 'Apache-2.0 on npmjs.org.' },
  ghcr: { label: 'GHCR, public', note: 'Public on ghcr.io since 31 October 2026: no account, no login.' },
  'inside-grafana': { label: 'inside the grafana image', note: 'Ships baked into the grafana image; not published on its own.' },
};

export interface Release {
  pkg: PackageId;
  version: string;
  at: string;            // ISO time, UTC
  train: TrainId;
  tagged: boolean;       // false: a version that shipped only inside another package
  image?: string;        // full image reference, for container images
  digest?: string;
  plugin?: string;       // grafana image: the app version inside
  needs?: string;        // from docs/compatibility.md, for this release line
  note: string;          // one line, what a user gets
}

export type TrainId = 'first-tags' | 'ouo11y-images' | 'sdks-npm' | 'data-lifecycle' | 'funnels';

export interface Train { id: TrainId; title: string; announcement: string; }

// `announcement` is the id (file name) of the post in src/content/announcements/.
export const trains: Train[] = [
  { id: 'first-tags', title: 'First tagged images', announcement: '2026-10-16-first-tagged-releases' },
  { id: 'ouo11y-images', title: 'Images under ghcr.io/ouo11y', announcement: '2026-10-22-images-under-ouo11y' },
  { id: 'sdks-npm', title: 'SDKs on npm', announcement: '2026-10-23-sdks-on-npm' },
  { id: 'data-lifecycle', title: 'Data lifecycle, session page, Sentry parity', announcement: '2026-10-24-data-lifecycle-and-session-page' },
  { id: 'funnels', title: 'Funnels, readable stacks, browser 0.3', announcement: '2026-10-26-funnels-stacks-browser-0-3' },
];

export const releases: Release[] = [
  // 16 October: the first tagged versions, under the pre-rename image path.
  { pkg: 'collector', version: '0.2.0', at: '2026-10-16T22:54:59Z', train: 'first-tags', tagged: true,
    image: 'ghcr.io/ziadmansourm/ouo/collector:0.2.0', digest: 'sha256:3a3dae7f8bf03b325fcdab5badaec9e0ab43ca1f0cdbba869114b480fc1f962e',
    needs: 'rum-api ≥ 0.2.0', note: 'First image: replay and Sentry receivers, rate limiting, Collector components 0.160.0.' },
  { pkg: 'rum-api', version: '0.2.0', at: '2026-10-16T22:55:02Z', train: 'first-tags', tagged: true,
    image: 'ghcr.io/ziadmansourm/ouo/rum-api:0.2.0', digest: 'sha256:d60c9d22dda180b82598aa4a19be75a497e7e38b757ae5ad844d487501ed2025',
    note: 'First image.' },
  { pkg: 'plugin', version: '0.6.0', at: '2026-10-16T22:59:35Z', train: 'first-tags', tagged: false,
    note: 'Taps in Sentry video replays, an activity list beside the players. Shipped inside grafana 0.2.0 as ouo-rum-app.' },
  { pkg: 'grafana', version: '0.2.0', at: '2026-10-16T22:59:35Z', train: 'first-tags', tagged: true, plugin: '0.6.0',
    image: 'ghcr.io/ziadmansourm/ouo/grafana:0.2.0', digest: 'sha256:f9677d360cf82e6ed81d1aec453d0d9d1277dd0cf143c18804c9f51e1ed8b86e',
    needs: 'rum-api ≥ 0.2.0', note: 'First image: Grafana 13.2.1 with the app inside.' },

  // 22 October: the same three images, first time under ghcr.io/ouo11y.
  { pkg: 'rum-api', version: '0.3.0', at: '2026-10-22T21:05:45Z', train: 'ouo11y-images', tagged: true,
    image: 'ghcr.io/ouo11y/rum-api:0.3.0', digest: 'sha256:96761dd7bc83322de1f8c4993e152be071de4c522b33976259c63898eabfc941',
    note: 'New name and image path. No API, storage or configuration change.' },
  { pkg: 'plugin', version: '0.7.0', at: '2026-10-22T21:08:02Z', train: 'ouo11y-images', tagged: false,
    note: 'Plugin ID ouo11y-rum-app (was ouo-rum-app). Shipped inside grafana 0.3.0.' },
  { pkg: 'grafana', version: '0.3.0', at: '2026-10-22T21:08:02Z', train: 'ouo11y-images', tagged: true, plugin: '0.7.0',
    image: 'ghcr.io/ouo11y/grafana:0.3.0', digest: 'sha256:fa0e8d43fc09bd2fd3f18886701b43c8b11d9aa4083b43cb38c7325be3a74c2d',
    needs: 'rum-api ≥ 0.2.0', note: 'New image path; the app inside is ouo11y-rum-app 0.7.0.' },
  { pkg: 'collector', version: '0.3.0', at: '2026-10-22T21:10:11Z', train: 'ouo11y-images', tagged: true,
    image: 'ghcr.io/ouo11y/collector:0.3.0', digest: 'sha256:89abb58aa365b6aa1d4b9ffb13099dec634ef130611c84d94ad108bb147c244e',
    needs: 'rum-api ≥ 0.2.0', note: 'New image path; configs keep working. Sentry data carries ouo.rum.mode = sentry.' },

  // 23 October: both SDKs public on npmjs.org (npm publish times).
  { pkg: 'browser', version: '0.2.0', at: '2026-10-23T22:15:06Z', train: 'sdks-npm', tagged: true,
    needs: 'collector ≥ 0.2.0, rum-api ≥ 0.2.0', note: 'Talks only to the collector, with HTTP Basic project credentials.' },
  { pkg: 'react-native', version: '0.2.0', at: '2026-10-23T22:15:28Z', train: 'sdks-npm', tagged: true,
    needs: 'collector ≥ 0.2.0, rum-api ≥ 0.2.0', note: 'Talks only to the collector, with HTTP Basic project credentials; XHR tracing.' },
  { pkg: 'react-native', version: '0.2.1', at: '2026-10-23T22:50:49Z', train: 'sdks-npm', tagged: true,
    needs: 'collector ≥ 0.2.0, rum-api ≥ 0.2.0', note: 'Released from CI with npm trusted publishing. No code change.' },
  { pkg: 'browser', version: '0.2.1', at: '2026-10-23T22:50:57Z', train: 'sdks-npm', tagged: true,
    needs: 'collector ≥ 0.2.0, rum-api ≥ 0.2.0', note: 'Released from CI with npm trusted publishing. No code change.' },

  // 24 October.
  { pkg: 'plugin', version: '0.8.0', at: '2026-10-24T22:15:12Z', train: 'data-lifecycle', tagged: true,
    needs: 'rum-api ≥ 0.4.0, Grafana ≥ 13.0.0', note: 'Session page: activity list beside the player, stack traces, device and OS in the header.' },
  { pkg: 'rum-api', version: '0.4.0', at: '2026-10-24T22:16:43Z', train: 'data-lifecycle', tagged: true,
    image: 'ghcr.io/ouo11y/rum-api:0.4.0', digest: 'sha256:b7371a45df7cabac132168ead80b1ff0c73c9bec6964d2c22da557987062dc80',
    note: 'Replay retention, delete by user or project with an audit log, server-side sampling, schema guard.' },
  { pkg: 'grafana', version: '0.4.0', at: '2026-10-24T22:20:41Z', train: 'data-lifecycle', tagged: true, plugin: '0.8.0',
    image: 'ghcr.io/ouo11y/grafana:0.4.0', digest: 'sha256:b5635e2bd55fdcb00f6eece9e8525b8ea294fafa3fdfc920b8085f60158a07ff',
    needs: 'rum-api ≥ 0.4.0', note: 'Grafana 13.2.1 with the app 0.8.0.' },
  { pkg: 'collector', version: '0.4.0', at: '2026-10-24T22:26:08Z', train: 'data-lifecycle', tagged: true,
    image: 'ghcr.io/ouo11y/collector:0.4.0', digest: 'sha256:ca0d001dc58153671fc501cbe280a69f86dc3e681a1b4621e827dedadb7727f2',
    needs: 'rum-api ≥ 0.2.0', note: 'Sentry bridge parity, mobile vitals from Sentry, counted auth failures.' },

  // 25 and 26 October.
  { pkg: 'rum-api', version: '0.5.0', at: '2026-10-25T20:22:42Z', train: 'funnels', tagged: true,
    image: 'ghcr.io/ouo11y/rum-api:0.5.0', digest: 'sha256:1ee9e606220df2c42f4ade4131fdd3f82085d6e814676a771754a85a6ae78336',
    note: 'Funnel API, source map upload and symbolication, device_id on sessions.' },
  { pkg: 'plugin', version: '0.9.0', at: '2026-10-25T20:45:25Z', train: 'funnels', tagged: true,
    needs: 'rum-api ≥ 0.4.0 (funnels and mapped stacks: ≥ 0.5.0), Grafana ≥ 13.0.0', note: 'Funnels page; source-mapped stack traces with an Original / Raw toggle.' },
  { pkg: 'browser', version: '0.3.0', at: '2026-10-26T10:15:56Z', train: 'funnels', tagged: true,
    needs: 'collector ≥ 0.2.0, rum-api ≥ 0.2.0 (mapped stacks, device_id: ≥ 0.5.0)', note: 'Delivery with retry, gzip and an offline store; session rotation on user change; device.id.' },
  { pkg: 'grafana', version: '0.5.0', at: '2026-10-26T10:31:28Z', train: 'funnels', tagged: true, plugin: '0.9.0',
    image: 'ghcr.io/ouo11y/grafana:0.5.0', digest: 'sha256:57607a3616c88867644be1f69abb4681ca73df05d6bf2682543418f0dfeb622f',
    needs: 'rum-api ≥ 0.4.0 (funnels and mapped stacks: ≥ 0.5.0)', note: 'Grafana 13.2.1 with the app 0.9.0.' },
];

// Announcements that are not releases, shown as flags on the timeline.
export const milestones: { at: string; label: string; announcement: string }[] = [
  { at: '2026-10-18T12:00:00Z', label: 'Renamed to ouo11y', announcement: '2026-10-18-renamed-to-ouo11y' },
  { at: '2026-10-28T12:00:00Z', label: 'ouo11y.com and the docs', announcement: '2026-10-28-ouo11y-com' },
  { at: '2026-10-29T12:00:00Z', label: 'The blog', announcement: '2026-10-29-the-blog' },
  { at: '2026-10-31T12:00:00Z', label: 'Images public', announcement: '2026-10-31-images-public' },
];

export function grafanaWithPlugin(pluginVersion: string) {
  return releases.find((r) => r.pkg === 'grafana' && r.plugin === pluginVersion)?.version;
}

export const releasesOf = (pkg: PackageId) =>
  releases.filter((r) => r.pkg === pkg).sort((a, b) => a.at.localeCompare(b.at));

export const latest = (pkg: PackageId) => releasesOf(pkg).at(-1)!;

export const inTrain = (id: TrainId) => releases.filter((r) => r.train === id).sort((a, b) => a.at.localeCompare(b.at));

export const pkg = (id: PackageId) => packages.find((p) => p.id === id)!;

export const train = (id: TrainId) => trains.find((t) => t.id === id)!;

// The version before `r` of the same package, for "from → to" in upgrade tables.
export function previous(r: Release) {
  const list = releasesOf(r.pkg);
  return list[list.indexOf(r) - 1];
}

export const day = (iso: string) => iso.slice(0, 10);
