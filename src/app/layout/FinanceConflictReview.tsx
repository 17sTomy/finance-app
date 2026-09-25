import { useState } from 'react';
import { useFinance } from '../providers/FinanceProvider';
import { Modal } from '../../shared/components/Modal';
import type { FinanceConflictChoices } from '../../infrastructure/persistence/financeMerge';

const describe = (value: unknown): string => {
  if (value === undefined) return 'Eliminado';
  if (typeof value === 'boolean') return value ? 'Activo' : 'Inactivo';
  if (Array.isArray(value)) return value.map(describe).join('; ');
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return [item.name ?? item.title ?? 'Elemento', item.amount !== undefined ? String(item.amount) + ' ' + (item.currency ?? '') : '', item.date ?? item.fromMonth ?? ''].filter(Boolean).join(' · ');
  }
  return String(value);
};
const labels: Record<string, string> = { transactions: 'Movimiento', categories: 'Categoría', fixedExpenses: 'Gasto fijo', recurringIncomes: 'Ingreso', goals: 'Objetivo', installmentPlans: 'Cuotas', months: 'Mes', amount: 'Importe', name: 'Nombre', date: 'Fecha', currency: 'Moneda', notes: 'Notas', active: 'Activo' };

export function FinanceConflictReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { syncConflicts, resolveSyncConflicts, exportJson, exportRemoteJson, database, refreshFinance } = useFinance();
  const [choices, setChoices] = useState<FinanceConflictChoices>({});
  const download = (remote: boolean) => {
    const url = URL.createObjectURL(new Blob([remote ? exportRemoteJson() : exportJson('all')], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = remote ? 'finance-copia-guardada.json' : 'finance-copia-local.json';
    link.click(); URL.revokeObjectURL(url);
  };
  const label = (path: string) => {
    const [, collection, id, field] = path.split('/');
    const entries = collection === 'transactions' ? Object.values(database.months).flatMap((month) => month.transactions)
      : database[collection as keyof typeof database];
    const entry = Array.isArray(entries) ? entries.find((item) => item.id === id) : undefined;
    const name = entry && 'name' in entry ? String(entry.name) : labels[collection] ?? 'Dato';
    return name + (field ? ' · ' + (labels[field] ?? field) : '');
  };
  return <Modal open={open} title="Revisar cambios pendientes" onClose={onClose}>
    <p>Elegí qué valor conservar para cada diferencia. Los demás gastos de ambas copias se combinan automáticamente.</p>
    <div className="form-actions">
      <button className="button button--ghost" onClick={() => download(false)}>Descargar mi copia</button>
      <button className="button button--ghost" onClick={() => download(true)}>Descargar copia guardada</button>
    </div>
    {syncConflicts.map((conflict) => <fieldset key={conflict.path}>
      <legend>{label(conflict.path)}</legend>
      {conflict.reference && <p>Revisá la categoría o regla de este dato en la app y luego volvé a comprobar. Las dos copias siguen disponibles para descargar.</p>}
      <label><input type="radio" name={conflict.path} checked={choices[conflict.path] === 'local'} onChange={() => setChoices((current) => ({ ...current, [conflict.path]: 'local' }))} /> Mi cambio: <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{describe(conflict.local)}</span></label>
      <label><input type="radio" name={conflict.path} checked={choices[conflict.path] === 'remote'} onChange={() => setChoices((current) => ({ ...current, [conflict.path]: 'remote' }))} /> Guardado: <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{describe(conflict.remote)}</span></label>
    </fieldset>)}
    <div className="form-actions"><button className="button button--primary" disabled={syncConflicts.some((conflict) => conflict.reference || !choices[conflict.path])} onClick={() => { resolveSyncConflicts(choices); setChoices({}); onClose(); }}>Combinar y guardar</button><button className="button button--ghost" onClick={() => { refreshFinance(); onClose(); }}>Volver a comprobar</button></div>
  </Modal>;
}
