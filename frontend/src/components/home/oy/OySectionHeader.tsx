import { ReactNode } from 'react';

interface OySectionHeaderProps {
  title: ReactNode;
  /** 부제(2번째 줄) */
  subtitle?: ReactNode;
  /** 우측 "더보기 >" 클릭 */
  onMore?: () => void;
  /** 우측 끝에 붙는 작은 표시(예: 마이 성분 ♥ 개수). 더보기와 함께 쓰지 않는다 */
  aside?: ReactNode;
  /** aside를 제목과 세로 가운데에 맞춘다(글자 링크처럼 제목과 한 줄로 읽혀야 할 때). 기본은 위쪽 맞춤 */
  centerAside?: boolean;
  /** 헤더 아래 간격(기본 mb-3 = 12px) */
  bottomClass?: string;
}

/** 올리브영식 섹션 헤더 — 좌측 굵은 블랙 제목 + 우측 더보기 */
export function OySectionHeader({ title, subtitle, onMore, aside, centerAside = false, bottomClass = 'mb-3' }: OySectionHeaderProps) {
  return (
    <div className={`flex justify-between ${bottomClass} ${centerAside ? 'items-center' : 'items-start'}`}>
      <h2 className="text-[19px] font-extrabold text-oy-text leading-snug">
        {title}
        {subtitle && <span className="block">{subtitle}</span>}
      </h2>
      {aside && <div className={`shrink-0 ${centerAside ? '' : 'mt-1.5'}`}>{aside}</div>}
      {onMore && (
        <button
          onClick={onMore}
          className="shrink-0 inline-flex items-center gap-0.5 mt-1.5 text-sm text-oy-sub active:scale-95 transition-transform"
        >
          더보기
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
