import mulgae from '../assets/characters/mulgae.png';
import ongdalsaem from '../assets/characters/ongdalsaem.png';
import subuji from '../assets/characters/subuji.png';
import injeolmi from '../assets/characters/injeolmi.png';
import memilmuk from '../assets/characters/memilmuk.png';
import samak from '../assets/characters/samak.png';
import yuriguseul from '../assets/characters/yuriguseul.png';
import hwasan from '../assets/characters/hwasan.png';

import bgMulgae from '../assets/bg/mulgae.png';
import bgOngdalsaem from '../assets/bg/ongdalsaem.png';
import bgSubuji from '../assets/bg/subuji.png';
import bgInjeolmi from '../assets/bg/injeolmi.png';
import bgMemilmuk from '../assets/bg/memilmuk.png';
import bgSamak from '../assets/bg/samak.png';
import bgYuriguseul from '../assets/bg/yuriguseul.png';
import bgHwasan from '../assets/bg/hwasan.png';

// 결과창 카드의 타입별 색상 테마.
// accent = 배지 pill 배경 / "OO 피부" 제목 / 태그라인 강조("OO 타입") — 타입 색조의 쨍한 톤,
// deep = 버튼·닫기, border = 카드 테두리, titleShadow = 제목 그림자, cardText = 카드 안 본문 색.
// (subuji는 Figma "수부지" 실측값 그대로: accent #40A140 / deep #00916D. 나머지 7종은 같은 방식으로 각 색조에 맞춰 지정.)
export interface ResultTheme {
  accent: string;
  deep: string;
  border: string;
  titleShadow: string;
  cardText: string;
}

export interface SkinType {
  id: string;
  label: string;
  short: string; // 결과창 카드 제목용 ("수부지 피부")
  image: string;
  bg: string; // 결과창 카드 배경 이미지
  description: string;
  theme: ResultTheme;
}

export const skinTypes: SkinType[] = [
  {
    id: 'mulgae', label: '반질반질물개', short: '물개', image: mulgae, bg: bgMulgae,
    description: '물놀이를 좋아하는 촉촉한 피부, 언제나 매끈해요!',
    theme: { accent: '#3AA17E', deep: '#2E7D63', border: '#BFE0D3', titleShadow: 'rgba(46,125,99,0.28)', cardText: '#234A40' },
  },
  {
    id: 'memilmuk', label: '얼룩덜룩메밀묵', short: '메밀묵', image: memilmuk, bg: bgMemilmuk,
    description: '말랑말랑 부드러운 피부, 손대면 톡 터질 것 같아요!',
    theme: { accent: '#7C6BB0', deep: '#5E5090', border: '#D6CEEA', titleShadow: 'rgba(94,80,144,0.26)', cardText: '#3A3357' },
  },
  {
    id: 'ongdalsaem', label: '수분팡팡옹달샘', short: '옹달샘', image: ongdalsaem, bg: bgOngdalsaem,
    description: '맑고 투명한 피부, 속에서부터 수분이 퐁퐁 솟아나요!',
    theme: { accent: '#2F9BD6', deep: '#2178AC', border: '#C4E1F2', titleShadow: 'rgba(33,120,172,0.26)', cardText: '#204A63' },
  },
  {
    id: 'samak', label: '바스락사막', short: '사막', image: samak, bg: bgSamak,
    description: '건조함과 친한 피부, 보습이 꼭 필요해요!',
    theme: { accent: '#C2873C', deep: '#9C6A28', border: '#EBD9BC', titleShadow: 'rgba(156,106,40,0.26)', cardText: '#5A431F' },
  },
  {
    id: 'subuji', label: '겉바속촉수부지', short: '수부지', image: subuji, bg: bgSubuji,
    description: '속은 촉촉, 겉은 번들, 종잡을 수 없는 피부예요!',
    theme: { accent: '#40A140', deep: '#00916D', border: '#B1D8B1', titleShadow: 'rgba(45,110,55,0.28)', cardText: '#223322' },
  },
  {
    id: 'yuriguseul', label: '조심조심유리구슬', short: '유리구슬', image: yuriguseul, bg: bgYuriguseul,
    description: '여리여리 예민한 피부, 조심조심 다뤄줘야 해요!',
    theme: { accent: '#E07A72', deep: '#B95850', border: '#F3D3D0', titleShadow: 'rgba(185,88,80,0.26)', cardText: '#5A2A26' },
  },
  {
    id: 'injeolmi', label: '말랑말랑인절미', short: '인절미', image: injeolmi, bg: bgInjeolmi,
    description: '말랑하게 힘이 풀린 피부, 탄력을 다시 채워줄 때예요!',
    theme: { accent: '#C99A3A', deep: '#A67C24', border: '#EEE0B8', titleShadow: 'rgba(166,124,36,0.26)', cardText: '#574421' },
  },
  {
    id: 'hwasan', label: '울긋불긋화산', short: '화산', image: hwasan, bg: bgHwasan,
    description: '트러블이 톡톡 올라오는 피부, 진정이 필요해요!',
    theme: { accent: '#D9694F', deep: '#B34E37', border: '#F1CFC6', titleShadow: 'rgba(179,78,55,0.26)', cardText: '#4A2620' },
  },
];

export const RESULT_TYPE_ID = 'subuji';

// ── 결과창 상세(해시태그 · 추천 성분) ──────────────────────────────
// 성분 기능 칩은 "기능" 자체를 뜻하므로 타입과 무관하게 같은 색을 쓴다.
const FX: Record<string, { c: string; b: string }> = {
  수분: { c: '#017CE3', b: '#C8E6FF' },
  보습: { c: '#0D6D1E', b: '#9AD5A5' },
  유수분: { c: '#7C6A25', b: '#FFE378' },
  진정: { c: '#2E7D63', b: '#BFE8DC' },
  장벽: { c: '#6D5AA6', b: '#DCD3F0' },
  각질: { c: '#A66A28', b: '#F0D9BB' },
  피지: { c: '#6A7C25', b: '#E5EEC5' },
  탄력: { c: '#B07C24', b: '#EEE0B8' },
  톤: { c: '#B95850', b: '#F3D3D0' },
};
const HT: Record<string, { color: string; bg: string }> = {
  blue: { color: '#005BCB', bg: '#DBE8F8' },
  amber: { color: '#CC8F00', bg: '#FEEDC5' },
  green: { color: '#2E7D3A', bg: '#D7EBD9' },
  coral: { color: '#B95850', bg: '#F3D3D0' },
  purple: { color: '#6D5AA6', bg: '#E4DEF3' },
  olive: { color: '#6A7C25', bg: '#E5EEC5' },
};
const ing = (name: string, fx: keyof typeof FX, desc: string) => ({
  name, tag: fx, tagColor: FX[fx].c, tagBg: FX[fx].b, desc,
});
const tag = (text: string, k: keyof typeof HT) => ({ text, color: HT[k].color, bg: HT[k].bg });

export interface ResultDetail {
  badge: string; // 카드 상단 배지 문구
  // 카드 안 설명: 1줄 + (2줄 앞 / 강조 / 2줄 뒤)
  taglineLead: string;
  taglineRest: string;
  taglineHighlight: string;
  taglineTail: string;
  hashtags: { text: string; color: string; bg: string }[];
  ingredients: { name: string; tag: string; tagColor: string; tagBg: string; desc: string }[];
}

// subuji는 Figma "수부지"(node 433:403) 실측값. 나머지 7종은 데모용 문안
// (실제 문구·성분은 유사도 엔진 Task 3 / 진단 엔진 Task 13 연동 시 교체).
export const RESULT_DETAILS: Record<string, ResultDetail> = {
  mulgae: {
    badge: '반질반질 물개 타입',
    taglineLead: '유수분 밸런스가 좋은 부러운 피부!',
    taglineRest: '지금 상태를 지켜줄 ',
    taglineHighlight: '물개 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#유수분밸런스', 'green'), tag('#탄탄장벽', 'purple')],
    ingredients: [
      ing('Ceramide', '장벽', '피부 장벽을 촘촘히 메워 수분이 새지 않게 해요.'),
      ing('Panthenol', '보습', '가벼운 보습으로 매끈한 결을 오래 유지해요.'),
      ing('Green Tea', '진정', '자극을 눌러 지금의 좋은 상태를 지켜줘요.'),
    ],
  },
  memilmuk: {
    badge: '얼룩덜룩 메밀묵 타입',
    taglineLead: '결이 거칠고 각질이 자주 일어나요!',
    taglineRest: '부드러운 정돈이 필요한 ',
    taglineHighlight: '메밀묵 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#각질고민', 'amber'), tag('#속당김', 'blue')],
    ingredients: [
      ing('PHA', '각질', '순하게 묵은 각질을 녹여 결을 매끈하게 해요.'),
      ing('Ceramide', '장벽', '정돈 후 약해진 장벽을 다시 채워줘요.'),
      ing('Allantoin', '진정', '각질 관리로 예민해진 피부를 달래줘요.'),
    ],
  },
  ongdalsaem: {
    badge: '수분팡팡 옹달샘 타입',
    taglineLead: '속부터 차오르는 맑은 피부!',
    taglineRest: '이 수분감을 오래 지킬 ',
    taglineHighlight: '옹달샘 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#속수분충전', 'blue'), tag('#맑은결', 'green')],
    ingredients: [
      ing('Hyaluronic Acid', '수분', '여러 층에서 수분을 끌어와 속을 채워줘요.'),
      ing('Beta-Glucan', '보습', '수분막을 얇게 덮어 촉촉함을 가둬요.'),
      ing('Madecassoside', '진정', '맑은 상태가 흐트러지지 않게 지켜줘요.'),
    ],
  },
  samak: {
    badge: '바스락 사막 타입',
    taglineLead: '당김과 각질이 늘 함께해요!',
    taglineRest: '진한 보습이 절실한 ',
    taglineHighlight: '사막 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#극건성', 'amber'), tag('#속당김', 'blue')],
    ingredients: [
      ing('Squalane', '유수분', '유분막을 씌워 수분 증발을 강하게 막아요.'),
      ing('Shea Butter', '보습', '건조로 갈라진 표면을 부드럽게 감싸줘요.'),
      ing('Ceramide', '장벽', '무너진 장벽을 채워 당김을 줄여줘요.'),
    ],
  },
  subuji: {
    badge: '겉바속촉 수부지 타입',
    taglineLead: '겉은 번들번들, 속은 메말랐어요!',
    taglineRest: '수분 충전이 시급한 ',
    taglineHighlight: '수부지 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#속건조', 'blue'), tag('#겉번들', 'amber')],
    ingredients: [
      ing('Hyaluronic Acid', '수분', '피부 깊숙이 강력한 수분을 충전해 줘요.'),
      ing('Panthenol', '보습', '수분을 채우고 무너진 피부 장벽을 강화해요.'),
      ing('Squalane', '유수분', '모공을 막지 않고 산뜻하게 수분막을 지켜줘요.'),
    ],
  },
  yuriguseul: {
    badge: '조심조심 유리구슬 타입',
    taglineLead: '작은 자극에도 붉어지고 따가워요!',
    taglineRest: '순하게 달래야 하는 ',
    taglineHighlight: '유리구슬 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#예민민감', 'coral'), tag('#붉은기', 'coral')],
    ingredients: [
      ing('Centella', '진정', '붉어진 자리를 빠르게 가라앉혀줘요.'),
      ing('Madecassoside', '진정', '반복되는 예민함의 뿌리를 다독여요.'),
      ing('Panthenol', '장벽', '자극에 약해진 장벽을 조심스레 채워줘요.'),
    ],
  },
  injeolmi: {
    badge: '말랑말랑 인절미 타입',
    taglineLead: '탄력이 조금씩 풀리고 있어요!',
    taglineRest: '볼륨을 다시 채워줄 ',
    taglineHighlight: '인절미 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#탄력저하', 'amber'), tag('#잔주름', 'green')],
    ingredients: [
      ing('Peptide', '탄력', '느슨해진 탄력 섬유를 다시 채워줘요.'),
      ing('Adenosine', '주름', '자리 잡은 잔주름을 완만하게 펴줘요.'),
      ing('Niacinamide', '톤', '고른 톤으로 처져 보이는 인상을 밝혀줘요.'),
    ],
  },
  hwasan: {
    badge: '울긋불긋 화산 타입',
    taglineLead: '곳곳에서 트러블이 올라와요!',
    taglineRest: '피지와 진정 케어가 필요한 ',
    taglineHighlight: '화산 타입',
    taglineTail: '이에요.',
    hashtags: [tag('#트러블잦음', 'coral'), tag('#피지과다', 'olive')],
    ingredients: [
      ing('Salicylic Acid', '피지', '모공 속 피지를 녹여 트러블을 눌러줘요.'),
      ing('Niacinamide', '피지', '과한 피지 분비를 잡아 번들거림을 줄여요.'),
      ing('Centella', '진정', '올라온 트러블 자국을 차분히 달래줘요.'),
    ],
  },
};
