FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 (psycopg2 빌드용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# 느린 회선에서 pip가 기본 타임아웃(15초)에 패키지를 못 받으면 "No matching distribution"으로
# 보고하며 빌드가 깨진다. 타임아웃과 재시도를 늘려 둔다.
RUN pip install --no-cache-dir --default-timeout=100 --retries 10 -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
