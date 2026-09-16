#!/usr/bin/env node
/**
 * 제품 목록 API의 응답을 받아 목업 폴백용 픽스처로 저장합니다.
 *
 *   npm run fixture:products                     # localhost:8000
 *   API_BASE=http://backend:8000 npm run fixture:products
 *
 * 이 픽스처는 백엔드 없이 `npm run dev`만 띄웠을 때 useProducts가 화면을
 * 채우는 데 씁니다(VITE_MOCK_FALLBACK). 손으로 적던 mocks/oliveyoung.ts의
 * OY_PRODUCTS를 대체한 것이라, 스키마가 바뀌어도 이 스크립트를 다시 돌리면
 * 됩니다 — 필드를 사람이 따라 적을 필요가 없습니다.
 *
 * 카테고리별로 나눠 받는 이유: 기본 정렬(리뷰수)로 한 번에 받으면 상위권이
 * 마스크팩·스킨케어에 쏠려 선케어가 한 건도 안 들어옵니다. 그러면 폴백에서
 * `category=선케어` 필터가 빈 목록을 돌려줘 화면이 비어 보입니다.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = process.env.API_BASE ?? 'http://localhost:8000';
const PER_CATEGORY = 15;
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/mocks/products.fixture.json',
);

/** DB의 카테고리 코드. 늘어나면 여기에 추가하면 됩니다. */
const CATEGORIES = ['스킨케어', '마스크팩', '클렌징', '선케어'];

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

const items = [];
const seen = new Set();

for (const category of CATEGORIES) {
  const { items: page } = await get(
    `/api/v1/products?size=${PER_CATEGORY}&category=${encodeURIComponent(category)}`,
  );
  for (const p of page) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    items.push(p);
  }
  console.log(`  ${category}: ${page.length}건`);
}

// id 순으로 고정해 둡니다. 같은 DB 상태에서 두 번 돌리면 같은 파일이 나와야
// diff가 의미 있는 변화만 보여줍니다.
items.sort((a, b) => a.id - b.id);

writeFileSync(
  OUT,
  JSON.stringify({ capturedAt: new Date().toISOString().slice(0, 10), items }, null, 2) + '\n',
  'utf8',
);

console.log(`\n✓ ${items.length}건 → ${OUT.replace(process.cwd(), '.')}`);
