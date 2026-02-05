import React from 'react';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
};

export default function Card({ hover = true, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`group relative rounded-2xl border border-border-subtle bg-panel-elevated shadow-focus transition-all duration-200 ease-out motion-reduce:transition-none ${
        hover
          ? 'hover:-translate-y-1 hover:shadow-xl hover:border-slate-200/80 active:translate-y-0 active:shadow-md motion-reduce:hover:translate-y-0'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
