import React from 'react';

type SectionProps = React.HTMLAttributes<HTMLElement> & {
  id?: string;
};

export default function Section({ id, className = '', children, ...props }: SectionProps) {
  return (
    <section id={id} className={`py-10 sm:py-12 md:py-16 ${className}`} {...props}>
      <div className="container-shell">{children}</div>
    </section>
  );
}
