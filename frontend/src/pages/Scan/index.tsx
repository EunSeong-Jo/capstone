import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../../hooks/useCamera';
import { useSearchProducts } from '../../hooks/useSearchProducts';
import type { Product } from '../../types';
import { addScan } from '../../api/personal';
import { useScanHistory } from '../../hooks/useScanHistory';
import { useToast } from '../../context/toast';
import { useAuth } from '../../context/auth';
import { useCloset } from '../../context/closet';

type ScanMode = 'barcode' | 'label' | 'product';

const MODES: [ScanMode, string][] = [
  ['barcode', '바코드'],
  ['label', '성분표'],
  ['product', '제품 통째로'],
];

/**
 * 성분 스캔 화면 — 제품 찾아 화장대에 담기.
 *
 * 예전에는 셔터를 누르면 `data/ocrFixtures.ts`의 고정 4건을 돌아가며
 * "인식된 것처럼" 보여줬다. 무엇을 찍든 같은 네 제품이 나왔다.
 *
 * 지금은 **제품명 검색**이 기본 경로다(`/api/v1/products/search`). 사진
 * 인식은 준비 중으로 표시한다 — `scripts/OCR_SUMMARY.md`의 벤치마크에서
 * 최고 엔진(CLOVA)도 완전 실패가 44.4%라, 붙여도 절반은 검색으로 떨어진다.
 * 그 폴백을 먼저 제대로 만드는 게 순서라는 게 그 문서의 결론이기도 하다.
 *
 * 카메라 프리뷰는 실제로 켠다(`useCamera`). 인식은 못 해도 무엇을 비추는지
 * 보이면 제품을 맞추기 쉽고, OCR을 붙일 때 이 자리가 그대로 쓰인다. 카메라를
 * 쓸 수 없으면 그 사실을 화면에 적는다 — 흐린 사진으로 대신하지 않는다.
 */
export default function ScanPage() {
  const navigate = useNavigate();
  const { addItem, hasItem } = useCloset();

  const { isUser } = useAuth();
  // 최근 스캔 3건. 전체는 /scan/history(ScanHistoryPage)에서 본다.
  const { items: scanHistory } = useScanHistory();
  const recentScans = scanHistory.slice(0, 3);
  const { showToast } = useToast();
  const [mode, setMode] = useState<ScanMode>('label');
  const [phase, setPhase] = useState<'idle' | 'search' | 'result'>('idle');
  const [result, setResult] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  // 목록으로 길게 보여 준다. 끝까지 내려 보며 고를 수 있게 넉넉히 받는다.
  const { products: found, total: foundTotal, loading: searching } = useSearchProducts(query, { size: 50 });
  // 사진 인식을 눌렀을 때의 안내. 준비 중임을 숨기지 않는다.
  const [notice, setNotice] = useState<string | null>(null);
  // 검색·결과 단계에서는 카메라를 끈다. 가려져 보이지도 않는데 켜 두면
  // 표시등만 켜지고 배터리를 쓴다.
  const { videoRef, ready: cameraReady, denied: cameraDenied } = useCamera(phase === 'idle');

  /** 셔터·갤러리 — 사진 인식은 아직 없다. 있는 척하지 않는다. */
  const handleCapture = () => {
    setNotice('사진으로 찾기는 준비 중이에요. 제품명으로 찾아 주세요.');
    setPhase('search');
    window.setTimeout(() => setNotice(null), 3000);
  };

  const pick = (product: Product) => {
    setResult(product);
    setPhase('result');
  };

  const saveToCloset = (product: Product) => {
    addItem({
      id: product.id,
      brand: product.brand,
      name: product.name,
      category: product.category,
      price: product.price,
      imageUrl: product.imageUrl,
      addedVia: 'scan',
      status: 'scanned',
    });
    // 스캔 기록도 남긴다. '최근 스캔'은 이 기록에서 온다.
    if (isUser) void addScan(product.id, 'search').catch(() => undefined);
  };

  const addToCloset = () => {
    if (!result) return;
    saveToCloset(result);
    navigate('/closet');
  };

  /** 검색 목록의 + 버튼. 화면을 떠나지 않고 이어서 더 담을 수 있게 한다. */
  const quickAdd = (product: Product) => {
    if (hasItem(product.id)) {
      showToast('이미 화장대에 있어요');
      return;
    }
    saveToCloset(product);
    showToast('화장대에 담았어요', { label: '화장대 보기', onClick: () => navigate('/closet') });
  };

  const reset = () => {
    setResult(null);
    setQuery('');
    setPhase('idle');
  };

  return (
    <div className="relative flex flex-col h-dvh overflow-hidden bg-[#111114]">
      {/* 카메라 프리뷰. 못 켜면 어두운 배경만 남는다 — 예전에는 picsum.photos
          난수 사진을 깔아 두었는데, 성분표처럼 보이지도 않으면서 "촬영 중"
          이라는 인상만 만들었다. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#1b1b20] to-[#0d0d10]" />
      {phase === 'idle' && cameraReady && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* 상단 바 */}
      <div className="relative z-10 px-5" style={{ paddingTop: 'calc(var(--safe-top) + 22px)' }}>
        <div className="flex h-[52px] items-center justify-between py-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.12] active:scale-90 transition-transform"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-[15px] font-extrabold text-white">성분 스캔</span>
          <button
            aria-label="플래시"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.12] active:scale-90 transition-transform"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L4.5 13h6L11 22l8.5-11h-6L13 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 스캔 프레임 + 마스코트 힌트 */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5">
        <div className="relative h-[310px] w-[264px]">
          <span className="absolute left-0 top-0 h-11 w-11 rounded-tl-[14px] border-l-[3.5px] border-t-[3.5px] border-[#4CC38A]" />
          <span className="absolute right-0 top-0 h-11 w-11 rounded-tr-[14px] border-r-[3.5px] border-t-[3.5px] border-[#4CC38A]" />
          <span className="absolute bottom-0 left-0 h-11 w-11 rounded-bl-[14px] border-b-[3.5px] border-l-[3.5px] border-[#4CC38A]" />
          <span className="absolute bottom-0 right-0 h-11 w-11 rounded-br-[14px] border-b-[3.5px] border-r-[3.5px] border-[#4CC38A]" />
          <span
            className={`absolute left-3 right-3 top-[46%] h-0.5 ${phase === 'search' ? 'animate-pulse' : ''}`}
            style={{ background: 'linear-gradient(90deg,rgba(76,195,138,0),#4CC38A,rgba(76,195,138,0))' }}
          />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-white/75">
            {phase === 'search' ? '제품명으로 찾는 중…' : '아래에서 제품명으로 찾아 주세요'}
          </span>
        </div>

        <div className="mt-6 flex items-center gap-2.5 rounded-full bg-white/95 py-1.5 pl-2 pr-4 shadow-[0_6px_24px_rgba(0,0,0,.3)]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-light">
            <img src="/mascot/base_face_neutral.png" alt="" className="h-[82%] w-[82%] object-contain" />
          </span>
          <span className="text-xs font-bold text-gray-100">글자가 선명할수록 분석이 정확해요!</span>
        </div>
      </div>

      {/* 모드 선택 + 촬영 컨트롤 */}
      <div className="relative z-10 px-5">
        <div className="mb-4 flex items-center justify-center gap-5">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? 'inline-flex h-[30px] items-center rounded-full bg-white/[0.16] px-3.5 text-xs font-extrabold text-white'
                  : 'text-xs font-semibold text-white/50'
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-[18px] flex items-center justify-between px-[22px]">
          {/* 갤러리 */}
          <button
            onClick={handleCapture}
            aria-label="갤러리에서 선택"
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-2 border-white/40 active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10" r="1.5" />
              <path d="M21 16l-5-5-4 4-2-2-4 4" />
            </svg>
          </button>

          {/* 셔터 */}
          <button
            onClick={handleCapture}
            aria-label="촬영"
            disabled={false}
            className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-[4.5px] border-white bg-white/25 active:scale-95 transition-transform disabled:opacity-60"
          >
            <span className="h-[54px] w-[54px] rounded-full bg-white" />
          </button>

          {/* 외부 이미지 스캔 */}
          <button
            onClick={handleCapture}
            aria-label="이미지로 스캔"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.12] active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H5a1.5 1.5 0 00-1.5 1.5v13A1.5 1.5 0 005 20h13a1.5 1.5 0 001.5-1.5v-6" />
              <path d="M16 3.5h4.5V8M20.5 3.5L11 13" />
            </svg>
          </button>
        </div>
      </div>

      {/* 카메라를 못 켰다는 사실을 숨기지 않는다. 흐린 사진으로 대신하면
          사용자는 카메라가 켜진 줄 안다. */}
      {phase === 'idle' && cameraDenied && (
        <div className="relative z-10 mx-5 mb-2 rounded-xl bg-white/90 px-4 py-2.5 text-center text-[12px] leading-relaxed text-gray-70">
          카메라를 쓸 수 없어요. 권한을 허용했는지 확인해 주세요.
          <br />
          아래에서 제품명으로 찾을 수 있어요.
        </div>
      )}

      {notice && (
        <div className="relative z-10 mx-5 mb-2 rounded-xl bg-white/95 px-4 py-2.5 text-center text-[12px] font-semibold text-gray-100">
          {notice}
        </div>
      )}

      {/* 제품 찾기 + 최근 스캔 바텀시트 */}
      <div className="relative z-10 rounded-t-3xl bg-white px-5 pt-3.5" style={{ paddingBottom: 'calc(var(--safe-bottom) + 26px)' }}>
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-gray-20" />

        {/* 제품명 검색 — 지금은 이쪽이 실제로 동작하는 경로다 */}
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-gray-10 px-3 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="#9A9A9A" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPhase(e.target.value ? 'search' : 'idle');
            }}
            placeholder="제품명으로 찾기 (2자 이상)"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-50"
          />
          {query && (
            <button onClick={() => { setQuery(''); setPhase('idle'); }} aria-label="지우기" className="shrink-0 text-gray-50">
              ✕
            </button>
          )}
        </div>

        {query.trim().length >= 2 && (
          <div className="mb-3">
            {!searching && found.length > 0 && (
              <p className="mb-1 text-[11px] text-gray-50">
                '{query.trim()}' 검색 결과 {foundTotal.toLocaleString()}개
                {foundTotal > found.length ? ` 중 ${found.length}개` : ''}
              </p>
            )}
            <div className="max-h-[42vh] overflow-y-auto">
              {searching ? (
                <p className="py-4 text-center text-[11px] text-gray-50">찾는 중…</p>
              ) : found.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-gray-50">
                  검색 결과가 없어요
                </p>
              ) : (
                found.map((p) => {
                  const inCloset = hasItem(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-3 border-b border-gray-5 py-2.5">
                      <button
                        onClick={() => pick(p)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
                      >
                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-gray-10">
                          {p.imageUrl && (
                            <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-gray-100">{p.name}</span>
                          <span className="mt-0.5 block text-[10px] text-gray-50">
                            {p.brand} · {p.price.toLocaleString()}원
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={() => quickAdd(p)}
                        aria-label={inCloset ? `${p.name} 화장대에 있음` : `${p.name} 화장대에 추가`}
                        aria-pressed={inCloset}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-base font-bold active:scale-90 transition-transform ${
                          inCloset ? 'border-[#00916D] bg-[#00916D] text-white' : 'border-gray-20 text-gray-70'
                        }`}
                      >
                        {inCloset ? '✓' : '+'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-gray-100">최근 스캔</h3>
          <button onClick={() => navigate('/scan/history')} className="text-[11px] font-semibold text-gray-50 active:opacity-60">
            전체보기
          </button>
        </div>
        {recentScans.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-gray-50">
            아직 스캔한 제품이 없어요
          </p>
        ) : (
          recentScans.map((item, i) => (
            <button
              key={item.key}
              onClick={() => navigate(`/alternatives?seed=${item.id}&from=scan`)}
              className={`flex w-full items-center gap-3 py-2.5 text-left active:opacity-70 transition-opacity ${
                i < recentScans.length - 1 ? 'border-b border-gray-5' : ''
              }`}
            >
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-gray-10">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-gray-100">{item.name}</span>
                <span className="mt-0.5 block text-[10px] text-gray-50">
                  {item.brand}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      {/* 인식 결과 시트 */}
      {phase === 'result' && result && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={reset}>
          <div
            className="rounded-t-3xl bg-white px-5 pb-8 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-20" />
            <p className="text-[11px] font-bold text-primary">화장대에 담을 제품</p>
            <p className="mt-1 text-[10px] font-bold text-gray-50">{result.brand}</p>
            <h3 className="text-[15px] font-extrabold text-gray-100">{result.name}</h3>

            <div className="mt-3 flex items-center gap-3">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-10">
                {result.imageUrl && (
                  <img src={result.imageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-gray-100">
                  {result.price.toLocaleString()}원
                </p>
                <p className="mt-0.5 text-[11px] text-gray-50">
                  {result.category}
                  {result.rating ? ` · ⭐ ${result.rating}` : ''}
                </p>
                {/* 전성분은 상세 화면에서 본다. 여기서 개수만 세어 보여주면
                    실제로는 조회하지 않은 숫자를 지어내게 된다. */}
                <button
                  onClick={() => navigate(`/detail/${result.id}`)}
                  className="mt-1 text-[11px] font-bold text-primary"
                >
                  전성분 보기 →
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={reset}
                className="h-[48px] flex-1 rounded-xl border border-gray-20 text-[13px] font-bold text-gray-70 active:scale-[.98] transition-transform"
              >
                다시 스캔
              </button>
              <button
                onClick={addToCloset}
                className="h-[48px] flex-[2] rounded-xl text-[13px] font-bold text-white active:scale-[.98] transition-transform"
                style={{ background: '#00916D' }}
              >
                화장대에 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
