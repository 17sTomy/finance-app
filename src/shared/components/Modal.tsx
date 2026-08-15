import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal__header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

export function ConfirmDialog({ open, title = '¿Eliminar este elemento?', message, onConfirm, onClose }: { open: boolean; title?: string; message: string; onConfirm: () => void; onClose: () => void }) {
  return <Modal open={open} title={title} onClose={onClose}><p className="muted">{message}</p><div className="form-actions"><button className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button button--danger" onClick={() => { onConfirm(); onClose(); }}>Eliminar</button></div></Modal>;
}
