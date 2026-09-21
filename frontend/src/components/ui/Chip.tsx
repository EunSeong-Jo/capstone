interface ChipProps {
  label: string;
  variant?: 'good' | 'neutral' | 'warn';
  onRemove?: () => void;
}

export function Chip({ label, variant = 'neutral', onRemove }: ChipProps) {
  const styles: Record<string, string> = {
    good:    'border-primary text-primary bg-primary-light',
    neutral: 'border-gray-20 text-gray-70 bg-gray-10',
    warn:    'border-accent text-accent bg-accent-light',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${styles[variant]}`}
    >
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 opacity-60 hover:opacity-100"
          aria-label={`${label} 삭제`}
        >
          ✕
        </button>
      )}
    </span>
  );
}
