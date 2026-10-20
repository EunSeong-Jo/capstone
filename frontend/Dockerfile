FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# postinstall(copy-mediapipe.mjs)이 npm ci 도중에 실행되므로 스크립트를 먼저 복사해 둔다.
COPY scripts ./scripts
# 느린 회선에서 기본 fetch 타임아웃에 걸려 ETIMEDOUT으로 깨지는 것을 막는다.
RUN npm ci --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-mintimeout=20000

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
