import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> { children: ReactNode; accent?: boolean }
export function Card({ children, accent, className = '', ...props }: CardProps) {
  return <section className={`card ${accent ? 'card--accent' : ''} ${className}`} {...props}>{children}</section>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-header"><h2>{title}</h2>{action}</div>;
}
