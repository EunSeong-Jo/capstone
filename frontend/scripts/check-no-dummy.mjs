#!/usr/bin/env node
/**
 * 더미 제품 데이터 잔존 검사.
 *
 * 왜 필요한가: `src/mocks/`의 가짜 제품에 붙은 id가 실재 카탈로그 id와
 * 겹치면 404가 나지 않는다. 카드에 "코스알엑스 토너"라고 적어 두고 탭하면
 * `/detail/102`가 열려 **디오디너리 레티놀**이 나온다. 조용히 틀리기 때문에
 * 눈으로는 잡히지 않아 검사로 막는다.
 *
 * 규칙
 *   1. picsum.photos 등 난수 이미지 금지 — products.image_url이 전부 실 URL이다
 *   2. 제품 id를 담은 목업 상수 금지 — 허용 목록만 예외
 *
 * 허용하는 목업은 `mocks/products.fixture.json` 하나뿐이다. 손으로 적은 것이
 * 아니라 실제 API 응답 캡처본이고(`npm run fixture:products`), 백엔드가 없는
 * 로컬에서만 폴백으로 쓰인다.
 *
 * 실행: npm run check:dummy
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

/** 제품 id를 담지 않는, 정적 문구·오프라인 폴백만 있는 목업 */
const ALLOWED_MOCKS = new Set([
  'products.fixture.json', // 실 API 캡처본
  'home', // 날씨·케어문구 오프라인 폴백
  'search', // 인기 검색어·성분 사전 (정적 문구)
  'oliveyoung', // 도메인 드롭다운 (정적 문구)
]);

const PLACEHOLDER_HOSTS = [
  'picsum.photos',
  'placehold.co',
  'via.placeholder.com',
  'dummyimage.com',
];

/** 여러 줄 주석 안인지 추적한다. "예전에는 picsum을 썼다" 같은 설명이 있다. */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = line;
    if (inBlock) {
      const end = out.indexOf('*/');
      if (end === -1) return '';
      out = out.slice(end + 2);
      inBlock = false;
    }
    const start = out.indexOf('/*');
    if (start !== -1) {
      const end = out.indexOf('*/', start + 2);
      if (end === -1) {
        inBlock = true;
        out = out.slice(0, start);
      } else {
        out = out.slice(0, start) + out.slice(end + 2);
      }
    }
    const line2 = out.indexOf('//');
    return line2 === -1 ? out : out.slice(0, line2);
  });
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const lines = stripComments(readFileSync(file, 'utf8').split('\n'));

  lines.forEach((line, i) => {
    const where = `src/${rel}:${i + 1}`;

    for (const host of PLACEHOLDER_HOSTS) {
      if (line.includes(host)) {
        problems.push(`${where}  난수 이미지(${host}) — 실제 products.image_url을 쓰세요`);
      }
    }

    const importMatch = line.match(/from '([^']*mocks\/[^']+)'/);
    if (importMatch) {
      const target = importMatch[1].replace(/^.*mocks\//, '');
      if (!ALLOWED_MOCKS.has(target)) {
        problems.push(`${where}  허용되지 않은 목업 import(${target})`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error('더미 데이터가 남아 있습니다:\n');
  problems.forEach((p) => console.error('  ' + p));
  console.error(`\n총 ${problems.length}건. 자세한 배경은 이 스크립트 상단 주석을 보세요.`);
  process.exit(1);
}

console.log('더미 데이터 없음 ✓');
