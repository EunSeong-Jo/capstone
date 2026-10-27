import { ReactNode } from 'react';

interface OySectionHeaderProps {
  title: ReactNode;
  /** 부제(2번째 줄) */
  subtitle?: ReactNode;
  /** 우측 "더보기 >" 클릭 */
  onMore?: () => void;
  /** 우측 끝에 붙는 작은 표시(예: 마이 성분 ♥ 개수). 더보기와 함께 쓰지 않는다 */
  aside?: ReactNode;
}

/** 올리브영식 섹션 헤더 — 좌측 굵은 블랙 제목 + 우측 더보기 */
export function OySectionHeader({ title, subtitle, onMore, aside }: OySectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-3">
      <h2 className="text-[19px] font-extrabold text-oy-text leading-snug">
        {title}
        {subtitle && <span className="block">{subtitle}</span>}
      </h2>
      {aside && <div className="shrink-0 mt-1.5">{aside}</div>}
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
