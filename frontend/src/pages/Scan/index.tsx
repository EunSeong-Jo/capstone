import { ChangeEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../../hooks/useCamera';
import { useSearchProducts } from '../../hooks/useSearchProducts';
import type { Product } from '../../types';
import { useScanHistory } from '../../hooks/useScanHistory';
import { useToast } from '../../context/toast';
import { useCloset } from '../../context/closet';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { ProductMatch, scanProductImage } from '../../api/products';
import { ApiError } from '../../api/client';
import { captureVideoFrame, fileToScanImage } from '../../utils/scanImage';


/**
 * 화장품 스캔 화면 — 제품 찾기.
 *
 * 찾은 제품은 **스캔 기록**에 남는다(최근 스캔·`/scan/history`). 화장대에는
 * 사용자가 '화장대에 추가'나 `+`를 누를 때만 '보유 중'으로 담긴다 — 찾아본
 * 제품과 쓰고 있는 제품은 다르다.
 *
 * **사진으로 찾기**: 셔터(카메라 화면) 또는 갤러리 사진 → `POST /products/scan`
 * (CLOVA OCR → 제품명 대조) → 후보 목록. 자동으로 하나를 고르지 않는다 — 실사진에서
 * 정답과 '카탈로그에 없는 제품'의 점수가 겹쳐 임계값이 서지 않았다
 * (scripts/IMAGE_MATCH_SUMMARY.md ③). 그래서 후보를 보여 주고 "찾는 제품이 없어요"를
 * 함께 둔다. 앞면 사진은 텍스트 1위가 6/6이라 첫 후보가 대개 맞다.
 *
 * 인식 키가 없거나(503) 후보가 없으면 **제품명 검색**으로 이어진다. 카메라를 쓸 수
 * 없으면 그 사실을 화면에 적고, 셔터는 사진 고르기로 대신한다.
 *
 * 로그인 전용이다(`/scan`·`/scan/history` 모두 RequireAuth). OCR은 호출 수로 무료 한도·
 * 과금이 정해지고, 찾은 제품을 담는 화장대도 로그인 전용이라 비회원에게 남는 건
 * 이름 검색뿐인데 그건 검색 탭이 한다.
 */
export default function ScanPage() {
  const navigate = useNavigate();
  const { addItem, hasItem } = useCloset();
  const { prompt } = useLoginPrompt();

  // 최근 스캔 3건. 전체는 /scan/history(ScanHistoryPage)에서 본다.
  const { items: scanHistory, record } = useScanHistory();
  const recentScans = scanHistory.slice(0, 3);
  const { showToast } = useToast();
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'candidates' | 'search' | 'result'>('idle');
  const [candidates, setCandidates] = useState<ProductMatch[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  // 목록으로 길게 보여 준다. 끝까지 내려 보며 고를 수 있게 넉넉히 받는다.
  const { products: found, total: foundTotal, loading: searching } = useSearchProducts(query, { size: 50 });
  // 사진 인식 결과 안내(못 찾음·인식 불가 등). 잠시 보이고 사라진다.
  const [notice, setNotice] = useState<string | null>(null);
  // 검색·결과 단계에서는 카메라를 끈다. 가려져 보이지도 않는데 켜 두면
  // 표시등만 켜지고 배터리를 쓴다.
  const { videoRef, ready: cameraReady, denied: cameraDenied } = useCamera(phase === 'idle');

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  };

  /** 제품명 검색으로 넘긴다. 입력칸에 바로 포커스를 줘 이어서 칠 수 있게 한다. */
  const goSearch = (message: string) => {
    showNotice(message);
    setCandidates([]);
    setPhase('search');
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  /** 사진 → 후보. 못 찾거나 인식할 수 없으면 제품명 검색으로 이어 준다. */
  const runScan = async (image: string) => {
    setPhase('scanning');
    setNotice(null);
    try {
      const res = await scanProductImage(image);
      if (res.candidates.length === 0) {
        goSearch('제품을 찾지 못했어요. 제품명으로 찾아 주세요');
        return;
      }
      setCandidates(res.candidates);
      setPhase('candidates');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 로그인이 만료됐다(토큰 갱신도 실패).
        prompt('로그인이 만료됐어요. 다시 로그인해 주세요');
        setPhase('idle');
        return;
      }
      if (err instanceof ApiError && err.status === 503) {
        goSearch('지금은 사진으로 찾을 수 없어요. 제품명으로 찾아 주세요');
        return;
      }
      showNotice('사진을 읽지 못했어요. 제품 앞면이 잘 보이게 다시 찍어 주세요');
      setPhase('idle');
    }
  };

  /** 셔터 — 카메라 화면 한 장면. 카메라를 못 쓰면 사진 고르기로 대신한다. */
  const handleCapture = () => {
    const video = videoRef.current;
    if (!cameraReady || !video) {
      fileInputRef.current?.click();
      return;
    }
    let image: string;
    try {
      image = captureVideoFrame(video);
    } catch {
      showNotice('카메라 화면을 가져오지 못했어요. 다시 눌러 주세요');
      return;
    }
    void runScan(image);
  };

  const openGallery = () => {
    fileInputRef.current?.click();
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 사진을 다시 골라도 onChange가 오게
    if (!file) return;
    let image: string;
    try {
      image = await fileToScanImage(file);
    } catch {
      showNotice('사진을 열 수 없어요. 다른 사진을 골라 주세요');
      return;
    }
    void runScan(image);
  };

  /** 제품을 고르면 스캔한 것이다 — 스캔 기록에 남긴다 */
  const pick = (product: Product) => {
    setResult(product);
    setPhase('result');
    record(product);
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
    });
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
    // 결과 시트를 거치지 않았어도 스캔 화면에서 찾은 제품이다.
    record(product);
    saveToCloset(product);
    showToast('화장대에 담았어요', { label: '화장대 보기', onClick: () => navigate('/closet') });
  };

  const reset = () => {
    setResult(null);
    setCandidates([]);
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
      <div className="relative z-20 px-5" style={{ paddingTop: 'calc(var(--safe-top) + 22px)' }}>
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
          <span className="text-[15px] font-extrabold text-white">화장품 스캔</span>
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

      {/* 촬영 가이드 — 신분증 촬영처럼 제품 앞면을 가운데 틀에 맞추게 한다.
          실사진 평가에서 앞면은 텍스트 매칭 top-1 6/6, 뒷면(전성분 면)은 0건이었다
          (scripts/IMAGE_MATCH_SUMMARY.md). 틀 바깥은 box-shadow로 어둡게 덮는다. */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5">
        <p className="mb-4 text-center text-[13px] font-bold text-white">
          {phase === 'scanning'
            ? '사진을 읽는 중…'
            : phase === 'search'
              ? '제품명으로 찾는 중…'
              : '제품 앞면을 틀 안에 맞춰 주세요'}
        </p>
        <div
          className="relative h-[300px] w-[220px] rounded-[22px]"
          style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
        >
          <span className="absolute left-0 top-0 h-11 w-11 rounded-tl-[22px] border-l-[3.5px] border-t-[3.5px] border-[#4CC38A]" />
          <span className="absolute right-0 top-0 h-11 w-11 rounded-tr-[22px] border-r-[3.5px] border-t-[3.5px] border-[#4CC38A]" />
          <span className="absolute bottom-0 left-0 h-11 w-11 rounded-bl-[22px] border-b-[3.5px] border-l-[3.5px] border-[#4CC38A]" />
          <span className="absolute bottom-0 right-0 h-11 w-11 rounded-br-[22px] border-b-[3.5px] border-r-[3.5px] border-[#4CC38A]" />
          {/* 제품 실루엣 — 세로로 세운 용기를 앞에서 찍는 모습 */}
          <svg
            aria-hidden
            viewBox="0 0 100 140"
            className="absolute inset-0 m-auto h-[62%] w-[62%] opacity-35"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeDasharray="5 5"
          >
            <rect x="38" y="6" width="24" height="16" rx="3" />
            <rect x="22" y="22" width="56" height="112" rx="10" />
            <path d="M34 62h32M34 74h22" />
          </svg>
          <span
            className={`absolute left-3 right-3 top-[46%] h-0.5 ${phase === 'search' || phase === 'scanning' ? 'animate-pulse' : ''}`}
            style={{ background: 'linear-gradient(90deg,rgba(76,195,138,0),#4CC38A,rgba(76,195,138,0))' }}
          />
        </div>

      </div>

      {/* 촬영 컨트롤 */}
      <div className="relative z-10 px-5">
        <div className="mb-[18px] flex items-center justify-between px-[22px]">
          {/* 갤러리 */}
          <button
            onClick={openGallery}
            disabled={phase === 'scanning'}
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
            disabled={phase === 'scanning'}
            className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-[4.5px] border-white bg-white/25 active:scale-95 transition-transform disabled:opacity-60"
          >
            <span className="h-[54px] w-[54px] rounded-full bg-white" />
          </button>

          {/* 외부 이미지 스캔 */}
          <button
            onClick={openGallery}
            disabled={phase === 'scanning'}
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
            ref={searchInputRef}
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

      {/* 사진 고르기 — 갤러리·이미지 버튼, 카메라를 못 쓸 때의 셔터 */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {/* 사진으로 찾은 후보 — 자동으로 고르지 않는다. 첫 후보가 대개 맞다. */}
      {phase === 'candidates' && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={reset}>
          <div
            className="max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-20" />
            <h3 className="text-[15px] font-extrabold text-gray-100">이 제품인가요?</h3>
            <p className="mt-0.5 text-[11px] text-gray-50">사진에서 읽은 글자로 찾은 제품이에요. 맞는 제품을 골라 주세요</p>
            <ul className="mt-3 divide-y divide-gray-5">
              {candidates.map(({ product: p }) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="flex w-full items-center gap-3 py-2.5 text-left active:opacity-70"
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-gray-10">
                      {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-bold text-gray-50">{p.brand}</span>
                      <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-100">{p.name}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-extrabold text-gray-100">{p.price.toLocaleString()}원</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                onClick={reset}
                className="h-[44px] flex-1 rounded-xl border border-gray-20 text-[13px] font-bold text-gray-70 active:scale-[.98] transition-transform"
              >
                다시 찍기
              </button>
              <button
                onClick={() => goSearch('제품명으로 찾아 주세요')}
                className="h-[44px] flex-[2] rounded-xl bg-gray-100 text-[13px] font-bold text-white active:scale-[.98] transition-transform"
              >
                찾는 제품이 없어요 · 이름으로 찾기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 인식 결과 시트 */}
      {phase === 'result' && result && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={reset}>
          <div
            className="rounded-t-3xl bg-white px-5 pb-8 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-20" />
            <p className="text-[11px] font-bold text-primary">스캔 기록에 저장했어요</p>
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
              {hasItem(result.id) ? (
                <button
                  onClick={() => navigate('/closet')}
                  className="h-[48px] flex-[2] rounded-xl border border-[#00916D] text-[13px] font-bold text-[#00916D] active:scale-[.98] transition-transform"
                >
                  화장대에 있어요 · 보러 가기
                </button>
              ) : (
                <button
                  onClick={addToCloset}
                  className="h-[48px] flex-[2] rounded-xl text-[13px] font-bold text-white active:scale-[.98] transition-transform"
                  style={{ background: '#00916D' }}
                >
                  화장대에 추가
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
