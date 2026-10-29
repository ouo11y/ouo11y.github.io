FROM python:3.14.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py .
# opentelemetry-instrument sets up the SDK from OTEL_* variables and turns on the installed
# instrumentations (psycopg, redis, logging) before worker.py runs.
CMD ["opentelemetry-instrument", "python", "-u", "worker.py"]
