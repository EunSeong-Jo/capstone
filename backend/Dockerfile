FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 (psycopg2 빌드용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# 느린 회선에서는 큰 패키지(opencv 60MB 등)를 받다가 전송이 멈춰 ReadTimeoutError로 빌드가
# 깨진다. pip의 --retries는 연결 실패에만 듣고, 24.x는 끊긴 다운로드를 이어받지도 못한다.
# 그래서 ① pip 25.1+로 올려 --resume-retries(이어받기)를 쓰고, ② 멈춘 연결을 오래 붙잡지 않게
# 타임아웃을 짧게 하고, ③ 받은 패키지를 BuildKit 캐시에 남긴 채 실패하면 통째로 다시 실행해
# 재시도마다 남은 부분만 받게 한다.
RUN --mount=type=cache,target=/root/.cache/pip \
    for i in 1 2 3 4 5 6 7 8 9 10; do \
      pip install --upgrade 'pip>=25.1' \
      && pip install --default-timeout=20 --resume-retries 10 -r requirements.txt \
      && exit 0; \
      echo "pip install 실패 ($i/10) — 5초 뒤 재시도"; sleep 5; \
    done; exit 1

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
