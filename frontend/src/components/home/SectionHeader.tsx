import { ReactNode } from 'react';

interface SectionHeaderProps {
  /** 매거진식 영문 오버라인 (예: "RANKING") */
  overline?: string;
  title: string;
  action?: ReactNode;
}

export function SectionHeader({ overline, title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        {overline && (
          <p className="font-body uppercase tracking-[0.08em] text-xs text-atelier-primary mb-0.5">
            {overline}
          </p>
        )}
        <h2 className="font-headline text-xl font-bold tracking-tight text-atelier-text">
          {title}
        </h2>
      </div>
      {action && <div className="shrink-0 pb-0.5">{action}</div>}
    </div>
  );
}
