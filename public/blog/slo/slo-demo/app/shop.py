"""Tiny Shop checkout API for the SLO demo. Python standard library only.

  python shop.py serve     the API on :8080, with /metrics, /admin/fault and /alerts
  python shop.py loadgen   sends traffic to the API at a steady rate

Metrics follow the OpenTelemetry HTTP convention http.server.request.duration,
written the way Prometheus names it: http_server_request_duration_seconds.
"""
import json
import os
import random
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10]
ROUTES = {("GET", "/products"), ("POST", "/checkout")}

lock = threading.Lock()
series = {}  # (route, status) -> [bucket counts..., count, sum]
fault = {"error": 0.0, "slow": 0.0, "slow_ms": 0}


def observe(route, status, seconds):
    with lock:
        s = series.setdefault((route, status), [0] * len(BUCKETS) + [0, 0.0])
        for i, le in enumerate(BUCKETS):
            if seconds <= le:
                s[i] += 1
        s[-2] += 1
        s[-1] += seconds


def exposition():
    out = [
        "# HELP http_server_request_duration_seconds Duration of HTTP server requests.",
        "# TYPE http_server_request_duration_seconds histogram",
    ]
    with lock:
        for (route, status), s in sorted(series.items()):
            labels = f'http_route="{route}",http_response_status_code="{status}"'
            for i, le in enumerate(BUCKETS):
                out.append(f'http_server_request_duration_seconds_bucket{{{labels},le="{le}"}} {s[i]}')
            out.append(f'http_server_request_duration_seconds_bucket{{{labels},le="+Inf"}} {s[-2]}')
            out.append(f"http_server_request_duration_seconds_count{{{labels}}} {s[-2]}")
            out.append(f"http_server_request_duration_seconds_sum{{{labels}}} {s[-1]:.6f}")
    return "\n".join(out) + "\n"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body, ctype="application/json"):
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def route(self, method):
        url = urlparse(self.path)
        if url.path == "/metrics":
            return self.reply(200, exposition(), "text/plain; version=0.0.4")
        if url.path == "/admin/fault":
            # /admin/fault?error=0.2&slow=0.1&slow_ms=600 sets the fault; no query clears it.
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            fault.update(error=float(q.get("error", 0)), slow=float(q.get("slow", 0)), slow_ms=int(q.get("slow_ms", 0)))
            print(f"fault set: {fault}", flush=True)
            return self.reply(200, json.dumps(fault))
        if url.path == "/alerts" and method == "POST":
            # Alertmanager's webhook lands here, so the demo shows routed alerts in `docker compose logs`.
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            for a in body.get("alerts", []):
                lab = a.get("labels", {})
                print(f"ALERT {a.get('status')}: {lab.get('alertname')} severity={lab.get('severity')} slo={lab.get('sloth_slo')}", flush=True)
            return self.reply(200, "{}")
        if (method, url.path) not in ROUTES:
            return self.reply(404, '{"error":"not found"}')

        start = time.monotonic()
        time.sleep(random.uniform(0.01, 0.08))  # normal work
        if random.random() < fault["slow"]:
            time.sleep(fault["slow_ms"] / 1000)
        status = 503 if random.random() < fault["error"] else 200
        if method == "POST":
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.reply(status, '{"ok":%s}' % ("true" if status == 200 else "false"))
        observe(url.path, status, time.monotonic() - start)


def loadgen():
    target = os.environ.get("TARGET", "http://shop:8080")
    rps = float(os.environ.get("RPS", "20"))

    def one():
        path, data = random.choice([("/products", None), ("/products", None), ("/checkout", b"{}")])
        try:
            urllib.request.urlopen(urllib.request.Request(target + path, data=data), timeout=5).read()
        except Exception:
            pass  # a 5xx raises; the server already counted it

    print(f"loadgen: {rps} req/s to {target}", flush=True)
    while True:
        threading.Thread(target=one, daemon=True).start()
        time.sleep(random.expovariate(rps))


if __name__ == "__main__":
    if sys.argv[1:] == ["loadgen"]:
        loadgen()
    else:
        print("shop: listening on :8080", flush=True)
        ThreadingHTTPServer(("", 8080), Handler).serve_forever()
