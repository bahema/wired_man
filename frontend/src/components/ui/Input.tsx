import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export default function Input({ label, className = '', ...props }: InputProps) {
  return (
    <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
      <span className="font-medium text-text">{label}</span>
      <input
        className={`w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 ${className}`}
        {...props}
      />
    </label>
  );
}
