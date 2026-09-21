import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'next' | 'ghost' | 'outline';
  fullWidth?: boolean;
}

export function Button({
  variant = 'next',
  fullWidth = true,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base = 'flex items-center justify-center font-semibold transition-transform active:scale-[.97] disabled:opacity-50';

  const variants: Record<string, string> = {
    primary: 'h-[52px] rounded-xl bg-white text-primary text-lg',
    next:    'h-[52px] rounded-xl bg-primary text-white text-lg',
    ghost:   'h-11 rounded-xl border text-sm',
    outline: 'h-11 rounded-xl border border-primary text-primary text-sm bg-white',
  };

  const width = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${base} ${variants[variant]} ${width} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
