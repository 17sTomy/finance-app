import { Sparkles } from 'lucide-react';
export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-state__icon"><Sparkles size={21} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
