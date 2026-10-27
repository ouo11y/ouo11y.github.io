# syntax=docker/dockerfile:1
# Grafana with the ouo11y RUM app plugin built from an ouo11y checkout (the Funnels page is not
# in a released image yet). compose.yaml passes the checkout as the named build context
# `ouo11y`; only the files copied below are sent. Same result as the released grafana image.
FROM node:24-bookworm-slim AS plugin
WORKDIR /src
# The plugin is an npm workspace of the repository: install from the root lockfile, plugin only.
COPY --from=ouo11y package.json package-lock.json ./
COPY --from=ouo11y sdk/browser/package.json sdk/browser/
COPY --from=ouo11y sdk/react-native/package.json sdk/react-native/
COPY --from=ouo11y examples/ouo-web/package.json examples/ouo-web/
COPY --from=ouo11y plugins/ouo11y-rum-app/package.json plugins/ouo11y-rum-app/
RUN npm ci --no-audit --no-fund --ignore-scripts -w plugins/ouo11y-rum-app
COPY --from=ouo11y plugins/ouo11y-rum-app/src plugins/ouo11y-rum-app/src
COPY --from=ouo11y plugins/ouo11y-rum-app/.config plugins/ouo11y-rum-app/.config
COPY --from=ouo11y plugins/ouo11y-rum-app/tsconfig.json plugins/ouo11y-rum-app/.cprc.json plugins/ouo11y-rum-app/README.md plugins/ouo11y-rum-app/CHANGELOG.md plugins/ouo11y-rum-app/LICENSE plugins/ouo11y-rum-app/
RUN npm run build -w plugins/ouo11y-rum-app

FROM grafana/grafana:13.2.1
COPY --from=plugin --chown=grafana:root /src/plugins/ouo11y-rum-app/dist /var/lib/grafana/plugins/ouo11y-rum-app
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=ouo11y-rum-app \
    GF_SECURITY_DISABLE_FRONTEND_SANDBOX_FOR_PLUGINS=ouo11y-rum-app
