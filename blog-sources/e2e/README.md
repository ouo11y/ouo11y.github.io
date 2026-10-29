# blog-e2e: one order, followed end to end

The runnable project behind the ouo11y.com series "End-to-end observability, hands-on".

    docker compose up -d --build

- Shop: http://localhost:47080 (click Buy; the page shows the trace_id and a Grafana link)
- Grafana: http://localhost:47300 (no login)
- RabbitMQ management: http://localhost:47672 (shop / shop)

The first start seeds 3 million orders into PostgreSQL; give it about a minute.
Change ports with E2E_*_PORT variables (see compose.yaml). Switch the worker to span links with
`E2E_TRACE_MODE=link docker compose up -d worker`.

Stop and delete everything, data included:

    docker compose down -v

Tested on 2026-10-29 with Docker 29.3.1 and Compose v5.1.1 on macOS (arm64).
