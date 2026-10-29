"""shop-worker: takes orders off the RabbitMQ queue, charges them, and marks them paid.

The process span is written by hand (no pika instrumentation) to show the two ways of joining
a consumer to its producer: as a child of the publish span, or as a new trace with a link.
"""
import json
import logging
import os
import random
import time

import pika
import psycopg
import redis
from opentelemetry import metrics, propagate, trace
from opentelemetry.trace import Link, SpanKind, Status, StatusCode

QUEUE = "orders"
TRACE_MODE = os.environ.get("TRACE_MODE", "child")

log = logging.getLogger("shop-worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
tracer = trace.get_tracer("shop-worker")
meter = metrics.get_meter("shop-worker")

# Messaging semantic conventions (Development status): seconds, explicit buckets.
BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60]
process_duration = meter.create_histogram(
    "messaging.process.duration", unit="s", explicit_bucket_boundaries_advisory=BUCKETS,
    description="Duration of processing operation.")
consumed = meter.create_counter(
    "messaging.client.consumed.messages", unit="{message}",
    description="Number of messages that were delivered to the application.")
# Not an OpenTelemetry convention: how long the message waited in the queue before we got it.
queue_wait = meter.create_histogram(
    "shop.queue.wait.duration", unit="s", explicit_bucket_boundaries_advisory=BUCKETS,
    description="Time from publish to the start of processing.")

db = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
cache = redis.Redis.from_url(os.environ["REDIS_URL"])

ATTRS = {
    "messaging.system": "rabbitmq",
    "messaging.destination.name": QUEUE,
    "messaging.operation.type": "process",
    "messaging.operation.name": "process",
}


def handle(channel, method, props, body):
    started = time.time()
    # traceparent travels in the AMQP headers; amqplib put it there on the API side.
    parent = propagate.extract(props.headers or {})
    publish_span = trace.get_current_span(parent).get_span_context()
    if TRACE_MODE == "link":
        span_args = {"context": None, "links": [Link(publish_span)]}
    else:
        span_args = {"context": parent}

    with tracer.start_as_current_span(
        f"process {QUEUE}", kind=SpanKind.CONSUMER,
        attributes={**ATTRS, "messaging.message.id": props.message_id or "",
                    "messaging.rabbitmq.destination.routing_key": method.routing_key},
        **span_args,
    ) as span:
        if props.timestamp:  # milliseconds, set by the API
            queue_wait.record(max(0.0, started - props.timestamp / 1000), ATTRS)
        order = json.loads(body)
        span.set_attribute("shop.order.id", order["orderId"])
        try:
            process(order)
            channel.basic_ack(method.delivery_tag)
            outcome = {}
        except Exception as err:  # noqa: BLE001 - a demo worker; requeue nothing, log everything
            span.record_exception(err)
            span.set_status(Status(StatusCode.ERROR, str(err)))
            channel.basic_nack(method.delivery_tag, requeue=False)
            outcome = {"error.type": type(err).__name__}
            log.exception("order %s failed", order["orderId"])
        # Recorded while the process span is current, so the SDK attaches its trace_id as an exemplar.
        process_duration.record(time.time() - started, {**ATTRS, **outcome})
        consumed.add(1, {**ATTRS, **outcome})


def process(order):
    with tracer.start_as_current_span("charge card"):
        time.sleep(random.uniform(0.02, 0.06))  # a payment provider, pretend
    with db.cursor() as cur:
        cur.execute("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = %s",
                    (order["orderId"],))
        # Loyalty: how many orders has this customer placed? The slow query of part 3.
        cur.execute("SELECT count(*) FROM orders WHERE customer_email = %s", (order["email"],))
        (count,) = cur.fetchone()
    cache.set(f"order:{order['orderId']}:status", "paid", ex=300)
    log.info("order %s paid, customer has %s orders", order["orderId"], count)


def main():
    params = pika.URLParameters(os.environ["AMQP_URL"])
    while True:
        try:
            conn = pika.BlockingConnection(params)
            break
        except pika.exceptions.AMQPConnectionError:
            time.sleep(1)
    channel = conn.channel()
    channel.queue_declare(QUEUE, durable=True)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(QUEUE, handle)
    log.info("shop-worker consuming from %s (trace mode: %s)", QUEUE, TRACE_MODE)
    channel.start_consuming()


if __name__ == "__main__":
    main()
