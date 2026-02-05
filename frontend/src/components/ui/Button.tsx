import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full font-semibold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-[1px] sm:min-h-[36px]';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-premium',
  secondary:
    'bg-panel text-text border border-border-subtle hover:shadow-premium',
  outline:
    'border border-border-subtle bg-panel-elevated text-text shadow-sm hover:bg-panel-elevated/80',
  ghost: 'text-text-muted hover:bg-panel-elevated',
  icon:
    'bg-panel text-text border border-border-subtle hover:shadow-premium'
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs sm:text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm sm:text-base'
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
