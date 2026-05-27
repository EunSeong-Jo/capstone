interface BadgeProps {
  type: 'BEST' | 'NEW' | 'SALE' | 'sim-high' | 'sim-mid';
  label?: string;
}

const BADGE_STYLES: Record<BadgeProps['type'], string> = {
  BEST:      'bg-warning text-white',
  NEW:       'bg-primary text-white',
  SALE:      'bg-accent text-white',
  'sim-high': 'bg-primary text-white',
  'sim-mid':  'bg-warning text-white',
};

export function Badge({ type, label }: BadgeProps) {
  const display = label ?? type;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${BADGE_STYLES[type]}`}>
      {display}
    </span>
  );
}
