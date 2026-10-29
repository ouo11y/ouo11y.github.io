# SLO demo: Tiny Shop checkout on Prometheus, Sloth, Alertmanager and Grafana

The files for "SLOs from first principles, part 4" on https://ouo11y.com/blog/slo-hands-on-sloth-prometheus/.
Needs Docker with Compose v2. Tested with Docker 29.3 on macOS.

    docker compose -p slo-demo up -d

| What | Where |
|---|---|
| Tiny Shop API (`/products`, `/checkout`, `/metrics`, `/admin/fault`) | http://localhost:23080 |
| Prometheus (rules, alerts) | http://localhost:23090 |
| Alertmanager | http://localhost:23093 |
| Grafana, dashboard "Tiny Shop SLOs" (anonymous viewer) | http://localhost:23000 |

Break checkout, then fix it:

    curl 'localhost:23080/admin/fault?error=0.2'              # 20% of requests fail with 503
    curl 'localhost:23080/admin/fault?slow=0.15&slow_ms=400'  # 15% of requests take 400 ms longer
    curl 'localhost:23080/admin/fault'                        # back to normal

Alerts routed by Alertmanager are printed by the shop's webhook:

    docker compose -p slo-demo logs -f shop

After editing `slos/tiny-shop.yaml`, regenerate the rules, test them, and reload Prometheus:

    docker run --rm -v "$PWD:/work" -w /work ghcr.io/slok/sloth:v0.16.0 generate -i slos/tiny-shop.yaml -o prometheus/rules/tiny-shop.rules.yml
    docker run --rm -v "$PWD/prometheus:/etc/prometheus:ro" --entrypoint promtool quay.io/prometheus/prometheus:v3.15.1 test rules /etc/prometheus/tests/tiny-shop.test.yml
    docker compose -p slo-demo restart prometheus

Stop and delete everything:

    docker compose -p slo-demo down -v
