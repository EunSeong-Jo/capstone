/**
 * 전성분 표시 보조.
 *
 * 크롤링 원문에는 기획세트 구분 라벨이 성분처럼 섞여 있습니다.
 *
 *     [토너] 정제수, 글리세린, ... , [에센스] 정제수, 나이아신아마이드, ...
 *
 * 파서가 이걸 성분 하나로 잡아 DB에 들어가 있습니다(396개 제품 · 1,139회).
 * 데이터를 고치려면 재적재가 필요하므로 표시 단계에서 분리합니다.
 * 오히려 "이 세트는 토너와 에센스로 구성" 이라는 정보가 드러납니다.
 *
 * 라벨이 항목 맨 앞에만 오는 게 아닙니다. 원문에 쉼표가 빠지면
 * 앞 구성품의 마지막 성분과 다음 라벨이 한 항목으로 붙습니다.
 *
 *     '세라마이드엔피 [PDRN] 정제수'
 *      └ 앞 묶음의 성분   └ 새 묶음  └ 새 묶음의 첫 성분
 *
 * 실제로 메디힐 7종 세트는 라벨 7개 중 6개가 이 형태입니다.
 */
import { ProductIngredient } from '../api/products';
import type { DictIngredient } from '../api/ingredients';

/** 라벨 하나로 묶인 성분 묶음. label이 null이면 구분 없는 일반 제품입니다. */
export interface IngredientGroup {
  label: string | null;
  items: ProductIngredient[];
}

// '세라마이드엔피 [PDRN] 정제수' → 앞 '세라마이드엔피' / 라벨 'PDRN' / 뒤 '정제수'
const LABELLED = /^(.*?)\s*\[([^\]]*)\]\s*(.*)$/;
// '[울트라' 처럼 닫는 괄호가 잘린 것도 있습니다 (원문이 잘린 경우)
const TRUNCATED = /^(.*?)\s*\[([^\]]+)$/;

interface Split {
  /** 라벨 앞에 붙어 있던 성분 — 직전 묶음에 속합니다 */
  before: string | null;
  label: string | null;
  /** 라벨 뒤에 붙어 있던 성분 — 새 묶음의 첫 항목입니다 */
  after: string | null;
}

function splitLabel(raw: string): Split {
  const m = raw.match(LABELLED) ?? raw.match(TRUNCATED);
  if (!m) return { before: null, label: null, after: raw.trim() || null };

  const before = m[1].trim();
  const label = m[2].trim();
  // TRUNCATED는 캡처가 2개뿐입니다.
  const after = (m[3] ?? '').trim();
  return {
    before: before || null,
    label: label || null,
    after: after || null,
  };
}

/**
 * position 순서를 유지하면서 라벨이 나올 때마다 새 묶음을 엽니다.
 *
 * 라벨이 하나도 없으면 묶음 1개(label null)로 떨어지므로,
 * 일반 제품(전체의 90%)은 아무 영향을 받지 않습니다.
 */
export function groupIngredients(ingredients: ProductIngredient[]): IngredientGroup[] {
  const groups: IngredientGroup[] = [];

  /** 마지막 묶음을 돌려주고, 없으면 라벨 없는 묶음을 하나 연다. */
  const tail = (): IngredientGroup => {
    if (groups.length === 0) groups.push({ label: null, items: [] });
    return groups[groups.length - 1];
  };

  for (const ing of ingredients) {
    const { before, label, after } = splitLabel(ing.name);

    // 라벨로 쪼갠 조각은 원본 항목(파싱 잔해)의 id를 물려받을 뿐 그 성분이 아니다.
    // 원본의 설명을 그대로 두면 '정제수' 칩에 엉뚱한 설명이 뜨므로 비워 둔다.
    const piece = (name: string): ProductIngredient =>
      label === null
        ? { ...ing, name }
        : {
            ...ing,
            name,
            description: null,
            keywords: [],
            descriptionSource: null,
            // 분류도 원본 항목의 것이다 — 조각이 그 성분이 아니므로 물려받지 않는다
            grade: null,
            isAllergen: false,
            functions: [],
            role: null,
            flags: [],
            confidence: null,
          };

    // 라벨 앞에 붙어 있던 성분은 아직 직전 묶음 소속이다.
    if (before) tail().items.push(piece(before));

    // 같은 라벨이 연달아 나오면 묶음을 새로 열지 않는다.
    if (label !== null && (groups.length === 0 || tail().label !== label)) {
      groups.push({ label, items: [] });
    }

    if (after) tail().items.push(piece(after));
  }

  // 라벨만 있고 성분이 하나도 안 붙은 빈 묶음은 버린다.
  return groups.filter((g) => g.items.length > 0);
}

/** 라벨을 제외한 실제 성분 개수. 화면에 "전성분 N개"로 표시합니다. */
export function countIngredients(groups: IngredientGroup[]): number {
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}


const FUNC_LABEL: Record<string, string> = {
  H: '보습', B: '장벽', S: '진정', W: '미백', A: '주름·탄력', O: '항산화', P: '피지·모공', E: '각질', U: '자외선차단',
};
const FLAG_LABEL: Record<string, string> = {
  F: '향료 성분',
  L: '건조를 부르는 알코올',
  I: '자극이 될 수 있는 성분',
};

/**
 * 성분 사전의 성분을 전성분 칩과 같은 시트·문구로 보여 주기 위한 변환.
 * 사전에는 표기 순서가 없어 position은 0이고, 피부타입 기준 분류('key')도 없다.
 */
export function dictToProductIngredient(d: DictIngredient): ProductIngredient {
  return {
    id: d.id,
    name: d.name,
    nameEn: d.nameEn ?? undefined,
    position: 0,
    grade: d.grade ?? null,
    isAllergen: d.isAllergen,
    functions: d.functions,
    role: d.role ?? null,
    flags: d.flags,
    confidence: d.confidence ?? null,
    description: d.description ?? null,
    keywords: d.keywords,
    descriptionSource: d.descriptionSource === 'llm' || d.descriptionSource === 'reviewed' ? d.descriptionSource : null,
  };
}

/** 기능 코드 → 한글 이름들 ('HS' → ['보습','진정']) */
export function functionNames(ing: ProductIngredient): string[] {
  return (ing.functions ?? []).map((f) => FUNC_LABEL[f]).filter(Boolean);
}

/**
 * 이 성분이 왜 그렇게 분류됐는지 한 줄씩. 칩 툴팁과 성분 시트가 같이 쓴다.
 *
 * 추천·주의가 모두 서버(`classify_ingredient`)의 판정이고, 여기서는 그 근거를 말로 옮길 뿐이다.
 * 확신도가 낮은 라벨은 "참고용"이라고 밝힌다 — 분류가 AI의 추정이기 때문이다.
 */
export function ingredientNotes(ing: ProductIngredient, skinTypeLabel?: string | null): string[] {
  const notes: string[] = [];
  const funcs = functionNames(ing);
  if (ing.isAllergen) notes.push('식약처 지정 알레르기 유발 착향제');
  for (const f of ing.flags ?? []) {
    if (f === 'F' && ing.isAllergen) continue;
    if (FLAG_LABEL[f]) notes.push(FLAG_LABEL[f]);
  }
  if (ing.grade === 'key') {
    notes.push(`${skinTypeLabel ?? '내 피부타입'}에 추천${funcs.length ? ` · ${funcs.join('·')}` : ''}`);
  } else if (funcs.length > 0 && ing.role && 'ae'.includes(ing.role)) {
    notes.push(funcs.join('·'));
  }
  if (ing.grade === null || ing.grade === undefined) notes.push('분류 미정');
  if (ing.confidence != null && ing.confidence <= 2 && ing.grade != null) notes.push('분류는 참고용이에요');
  return notes;
}
