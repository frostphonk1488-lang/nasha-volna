FROM python:3.12-slim
WORKDIR /app
COPY server /app/server
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
USER app
ENV NV_BIND=0.0.0.0 PORT=8080 NV_DATABASE=/data/nasha-volna.sqlite3
EXPOSE 8080
CMD ["python", "-m", "server.http"]
