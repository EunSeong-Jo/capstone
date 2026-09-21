#!/usr/bin/env node
// 팀원 제출물 셀프 점검 스크립트 (Node 내장 모듈만 사용, 추가 의존성 없음)
// 사용법: node scripts/check-submission.mjs <검사할 폴더 경로>
//   또는: npm run check-submission -- <검사할 폴더 경로>
//
// 이번 6건(최근본/좋아요/자주구매/마이페이지/카테고리/검색) 병합 과정에서 실제로
// 반복해서 걸렸던 문제를 규칙화했습니다. 자세한 배경은 frontend/ANALYSIS.md 참고.
// 셀프 점검용이라 경고가 있어도 종료 코드는 0입니다(빌드를 막지 않음).

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite']);
const SOURCE_EXT = new Set(['.tsx', '.jsx', '.ts', '.js']);

const BANNED_DEPS = [
  '@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled',
  '@radix-ui', 'zustand', 'lucide-react', '@ionic/react', '@ionic/core',
];

function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function check(target) {
  const findings = []; // { rule, level: 'warn'|'ok', message }
  const allFiles = collectFiles(target);
  const sourceFiles = allFiles.filter((f) => SOURCE_EXT.has(path.extname(f)));

  // 1. 독립 프로젝트로 스캐폴딩했는지
  const rootPkg = path.join(target, 'package.json');
  const rootIndexHtml = path.join(target, 'index.html');
  const rootViteConfig = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']
    .map((f) => path.join(target, f))
    .find((f) => fs.existsSync(f));
  if (fs.existsSync(rootPkg) && (fs.existsSync(rootIndexHtml) || rootViteConfig)) {
    findings.push({
      rule: 1, level: 'warn',
      message: `독립 Vite 프로젝트로 보입니다 (${path.relative(target, rootPkg)} + ${
        rootViteConfig ? path.basename(rootViteConfig) : 'index.html'
      } 동시 존재). frontend/src/pages/<기능>/ 안에서 작업해주세요.`,
    });
  } else {
    findings.push({ rule: 1, level: 'ok', message: '독립 프로젝트 스캐폴딩 흔적 없음' });
  }

  // 2. Anima/Figma 자동 추출 여부
  const sandboxConfig = fs.existsSync(path.join(target, 'sandbox.config.json'));
  const genericComponentFiles = sourceFiles.filter((f) =>
    /^Component\d*\.(tsx|jsx)$/.test(path.basename(f)),
  );
  if (sandboxConfig || genericComponentFiles.length >= 1) {
    findings.push({
      rule: 2, level: 'warn',
      message: `Anima/Figma 자동 추출로 보입니다${sandboxConfig ? ' (sandbox.config.json 발견)' : ''}${
        genericComponentFiles.length ? ` (제네릭 컴포넌트 ${genericComponentFiles.length}개: ${genericComponentFiles.slice(0, 3).map((f) => path.relative(target, f)).join(', ')}${genericComponentFiles.length > 3 ? ' 외' : ''})` : ''
      }. JSX는 참고만 하고 frontend 기존 컴포넌트로 다시 짜주세요.`,
    });
  } else {
    findings.push({ rule: 2, level: 'ok', message: 'Anima/Figma 자동 추출 흔적 없음' });
  }

  // 3. absolute-pixel 레이아웃
  const ABS_COORD_RE = /\b(top|left|right|bottom)-\[[^\]]+\]/g;
  const absPixelFiles = [];
  for (const file of sourceFiles) {
    const content = readSafe(file);
    const coordMatches = content.match(ABS_COORD_RE) ?? [];
    if (coordMatches.length >= 5 && /\b(absolute|fixed)\b/.test(content)) {
      absPixelFiles.push({ file, count: coordMatches.length });
    }
  }
  if (absPixelFiles.length > 0) {
    findings.push({
      rule: 3, level: 'warn',
      message: `absolute-pixel 레이아웃으로 보이는 파일 ${absPixelFiles.length}개: ${
        absPixelFiles.slice(0, 3).map((f) => `${path.relative(target, f.file)}(좌표 ${f.count}개)`).join(', ')
      }${absPixelFiles.length > 3 ? ' 외' : ''}. Tailwind flex/grid로 다시 짜주세요 (max-w-[430px] 프레임에서 반응형 필요).`,
    });
  } else {
    findings.push({ rule: 3, level: 'ok', message: 'absolute-pixel 레이아웃 흔적 없음' });
  }

  // 4. 금지 의존성
  if (fs.existsSync(rootPkg)) {
    try {
      const pkg = JSON.parse(readSafe(rootPkg));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const foundBanned = BANNED_DEPS.filter((name) =>
        Object.keys(deps).some((dep) => dep === name || dep.startsWith(`${name}/`)),
      );
      const tailwindVersion = deps.tailwindcss;
      const isTailwind4 = tailwindVersion && /^[^0-9]*4\./.test(tailwindVersion);
      if (foundBanned.length > 0 || isTailwind4) {
        const parts = [...foundBanned];
        if (isTailwind4) parts.push(`tailwindcss@${tailwindVersion} (frontend는 v3)`);
        findings.push({
          rule: 4, level: 'warn',
          message: `금지된 의존성 발견: ${parts.join(', ')}. package.json은 참고하지 말고 JSX만 가져오세요.`,
        });
      } else {
        findings.push({ rule: 4, level: 'ok', message: '금지된 의존성 없음' });
      }
    } catch {
      findings.push({ rule: 4, level: 'ok', message: 'package.json 파싱 불가 (건너뜀)' });
    }
  } else {
    findings.push({ rule: 4, level: 'ok', message: 'package.json 없음 (건너뜀)' });
  }

  // 5. 콘텐츠 하드코딩
  const PRICE_RE = /\d{1,3}(,\d{3})+원/g;
  const hardcodedContentFiles = [];
  for (const file of sourceFiles) {
    const content = readSafe(file);
    const priceMatches = content.match(PRICE_RE) ?? [];
    if (priceMatches.length >= 3 && !/from\s+['"][^'"]*mocks/.test(content)) {
      hardcodedContentFiles.push({ file, count: priceMatches.length });
    }
  }
  if (hardcodedContentFiles.length > 0) {
    findings.push({
      rule: 5, level: 'warn',
      message: `상품 가격이 JSX에 하드코딩된 것으로 보이는 파일 ${hardcodedContentFiles.length}개: ${
        hardcodedContentFiles.slice(0, 3).map((f) => `${path.relative(target, f.file)}(가격 ${f.count}개)`).join(', ')
      }${hardcodedContentFiles.length > 3 ? ' 외' : ''}. mocks/*.ts로 분리해주세요.`,
    });
  } else {
    findings.push({ rule: 5, level: 'ok', message: '콘텐츠 하드코딩 흔적 없음' });
  }

  // 6. 색상 하드코딩
  const HEX_RE = /#[0-9A-Fa-f]{6}\b/g;
  const hardcodedColorFiles = [];
  for (const file of sourceFiles) {
    const content = readSafe(file);
    const hexMatches = content.match(HEX_RE) ?? [];
    if (hexMatches.length >= 8) {
      hardcodedColorFiles.push({ file, count: hexMatches.length });
    }
  }
  if (hardcodedColorFiles.length > 0) {
    findings.push({
      rule: 6, level: 'warn',
      message: `색상 hex 하드코딩이 많은 파일 ${hardcodedColorFiles.length}개: ${
        hardcodedColorFiles.slice(0, 3).map((f) => `${path.relative(target, f.file)}(${f.count}개)`).join(', ')
      }${hardcodedColorFiles.length > 3 ? ' 외' : ''}. 가능하면 디자인 토큰(tailwind.config.ts, index.css)을 사용해주세요.`,
    });
  } else {
    findings.push({ rule: 6, level: 'ok', message: '색상 하드코딩 흔적 없음' });
  }

  return findings;
}

function printReport(target, findings) {
  console.log(`\n제출물 점검: ${target}\n`);
  const RULE_LABELS = {
    1: '독립 프로젝트 스캐폴딩',
    2: 'Anima/Figma 자동 추출',
    3: 'absolute-pixel 레이아웃',
    4: '금지된 의존성',
    5: '콘텐츠 하드코딩',
    6: '색상 하드코딩',
  };
  let warnCount = 0;
  for (const f of findings) {
    const icon = f.level === 'warn' ? '⚠️ ' : '✅';
    if (f.level === 'warn') warnCount += 1;
    console.log(`${icon} [${RULE_LABELS[f.rule]}] ${f.message}`);
  }

  console.log('\n───────────────────────────────────────────');
  console.log('PR 올리기 전 원본 export/스캐폴딩 폴더를 정리해주세요:');
  console.log('  - 삭제하거나');
  console.log('  - 디자인 근거로 남기고 싶으면 frontend/ANALYSIS.md에 요약 + docs/design/references/에 대표 스크린샷 1~2장만 보관');
  console.log('자세한 내용: frontend/README.md 10절, frontend/ANALYSIS.md');
  console.log('───────────────────────────────────────────');

  if (warnCount === 0) {
    console.log('\n모든 항목 통과했습니다. 🎉');
  } else {
    console.log(`\n${warnCount}개 항목에서 경고가 발견됐습니다. 빌드를 막지는 않지만 PR 전에 확인해주세요.`);
  }
}

const target = process.argv[2];
if (!target) {
  console.error('사용법: node scripts/check-submission.mjs <검사할 폴더 경로>');
  process.exit(1);
}
const resolved = path.resolve(target);
if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
  console.error(`폴더를 찾을 수 없습니다: ${resolved}`);
  process.exit(1);
}

const findings = check(resolved);
printReport(resolved, findings);
process.exit(0);
