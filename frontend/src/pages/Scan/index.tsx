import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RECENT_SCANS } from '../../mocks/search';

type ScanMode = 'barcode' | 'label' | 'product';

const MODES: [ScanMode, string][] = [
  ['barcode', '바코드'],
  ['label', '성분표'],
  ['product', '제품 통째로'],
];

/**
 * 성분 스캔 화면 (디자인 3c) — 성분표 OCR 카메라.
 * 검색바 카메라 / 마스코트 스캔 배너 / 하단 네비 스캔 버튼의 공통 목적지.
 * TODO: Task 4 이미지 인식 모듈(Tesseract/EasyOCR) 연동 — 현재는 카메라 UI 목업.
 */
export default function ScanPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ScanMode>('label');

  const handleCapture = () => {
    // TODO: Task 4 OCR 연동 후 촬영 → 전성분 인식 → 결과 화면 이동
    alert('성분 인식은 준비 중이에요 (OCR 연동 예정)');
  };

  return (
    <div className="relative flex flex-col h-dvh overflow-hidden bg-[#111114]">
      {/* 카메라 프리뷰 (목업: 흐린 성분표 이미지) */}
      <img
        src="https://picsum.photos/seed/labeltext/500/900"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-[0.28]"
      />

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
            className="absolute left-3 right-3 top-[46%] h-0.5"
            style={{ background: 'linear-gradient(90deg,rgba(76,195,138,0),#4CC38A,rgba(76,195,138,0))' }}
          />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-white/75">
            전성분 표를 프레임에 맞춰 주세요
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
            className="h-11 w-11 overflow-hidden rounded-xl border-2 border-white/40 active:scale-95 transition-transform"
          >
            <img src="https://picsum.photos/seed/gal1/88/88" alt="" className="h-full w-full object-cover" />
          </button>

          {/* 셔터 */}
          <button
            onClick={handleCapture}
            aria-label="촬영"
            className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-[4.5px] border-white bg-white/25 active:scale-95 transition-transform"
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

      {/* 최근 스캔 바텀시트 */}
      <div className="relative z-10 rounded-t-3xl bg-white px-5 pt-3.5" style={{ paddingBottom: 'calc(var(--safe-bottom) + 26px)' }}>
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-gray-20" />
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-gray-100">최근 스캔</h3>
          <button onClick={() => navigate('/history')} className="text-[11px] font-semibold text-gray-50 active:opacity-60">
            전체보기
          </button>
        </div>
        {RECENT_SCANS.map((s, i) => (
          <button
            key={s.seedId}
            onClick={() => navigate(`/alternatives?seed=${s.seedId}&from=scan`)}
            className={`flex w-full items-center gap-3 py-2.5 text-left active:opacity-70 transition-opacity ${
              i < RECENT_SCANS.length - 1 ? 'border-b border-gray-5' : ''
            }`}
          >
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-gray-10">
              <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-gray-100">{s.name}</span>
              <span className="mt-0.5 block text-[10px] text-gray-50">
                성분 {s.ingredientCount}개 인식 · {s.when}
              </span>
            </span>
            <span className="inline-flex h-[22px] items-center rounded-full bg-primary-light px-2 text-[10px] font-extrabold text-primary-dark">
              안전 {s.safeCount}
            </span>
            {s.cautionCount != null && (
              <span className="inline-flex h-[22px] items-center rounded-full bg-[#FFF4E5] px-2 text-[10px] font-extrabold text-warning">
                주의 {s.cautionCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
