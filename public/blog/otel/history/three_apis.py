# One trace, three APIs: OpenCensus (2018), OpenTracing (2016) and OpenTelemetry.
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = TracerProvider(resource=Resource.create({"service.name": "three-apis"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)

# OpenCensus: the shim swaps OpenCensus's tracer for one that writes OTel spans.
from opentelemetry.shim.opencensus import install_shim
install_shim()
from opencensus.trace.tracer import Tracer as CensusTracer

# OpenTracing: the shim is an OpenTracing tracer backed by the OTel tracer provider.
from opentelemetry.shim.opentracing_shim import create_tracer
ot_tracer = create_tracer(provider)

otel_tracer = trace.get_tracer("native")

with CensusTracer().span(name="opencensus: handle order") as oc_span:
    oc_span.add_attribute("order.id", "81")
    with ot_tracer.start_active_span("opentracing: charge card") as scope:
        scope.span.set_tag("payment.provider", "example-pay")
        with otel_tracer.start_as_current_span("opentelemetry: write ledger") as span:
            span.set_attribute("db.system.name", "postgresql")

provider.shutdown()
print("sent")
