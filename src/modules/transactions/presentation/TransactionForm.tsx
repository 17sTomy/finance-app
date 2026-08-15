import { useState, type FormEvent } from 'react';
import { useFinance } from '../../../app/providers/FinanceProvider';
import type { Currency, Transaction, TransactionType } from '../../finance/domain/models';

interface Props { initial?: Transaction; defaultType?: TransactionType; onDone: () => void }

export function TransactionForm({ initial, defaultType = 'expense', onDone }: Props) {
  const { database, selectedMonth, addTransaction, updateTransaction, addInstallmentPlan } = useFinance();
  const [type, setType] = useState<TransactionType>(initial?.type ?? defaultType);
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? `${selectedMonth}-15`);
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'ARS');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? 'other');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [installments, setInstallments] = useState(false);
  const [count, setCount] = useState('3');
  const [error, setError] = useState('');
  const categories = database.categories.filter((item) => item.kind === type || item.kind === 'all' || (type === 'expense' && item.kind === 'expense'));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    const installmentCount = Number(count);
    if (!name.trim()) return setError('Ingresá un nombre.');
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('El importe debe ser mayor a cero.');
    if (!date || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) return setError('Elegí una fecha válida.');
    if (installments && (!Number.isInteger(installmentCount) || installmentCount < 2 || installmentCount > 120)) return setError('Las cuotas deben ser entre 2 y 120.');
    if (installments && type === 'expense' && !initial) {
      addInstallmentPlan({ description: name.trim(), totalAmount: numericAmount, installmentCount, firstInstallmentDate: date, currency, categoryId, notes: notes.trim() || undefined });
    } else {
      const value = { name: name.trim(), amount: numericAmount, date, currency, categoryId, notes: notes.trim() || undefined, type, expenseType: type === 'expense' ? initial?.expenseType ?? 'variable' as const : undefined };
      if (initial) updateTransaction({ ...initial, ...value }); else addTransaction(value);
    }
    onDone();
  };

  return <form onSubmit={submit} className="form-grid" noValidate>
    {initial?.recurrenceId && <p className="form-note field--wide">Estás editando solo esta ocurrencia histórica. Para cambiar esta y las siguientes, editá la recurrencia desde Gastos fijos.</p>}
    {initial?.installmentPlanId && <p className="form-note field--wide">Estás editando solo esta cuota. Las demás cuotas mantienen el plan original.</p>}
    {!initial && <label>Tipo<select value={type} onChange={(event) => { setType(event.target.value as TransactionType); setCategoryId('other'); }}><option value="expense">Gasto</option><option value="income">Ingreso extra</option><option value="saving">Ahorro</option><option value="investment">Inversión</option></select></label>}
    <label className={!initial ? '' : 'field--wide'}>Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Supermercado" autoFocus /></label>
    <label>Importe<input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
    <label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option value="ARS">ARS — Pesos</option><option value="USD">USD — Dólares</option></select></label>
    <label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label>Categoría<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    {!initial && type === 'expense' && <label className="check-field field--wide"><input type="checkbox" checked={installments} onChange={(event) => setInstallments(event.target.checked)} /><span>Es una compra en cuotas</span></label>}
    {installments && <><label>Cantidad de cuotas<input type="number" min="2" max="120" value={count} onChange={(event) => setCount(event.target.value)} /></label><div className="calculated-value"><small>Valor por cuota</small><strong>{Number(amount) > 0 && Number(count) > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount) / Number(count)) : '—'}</strong></div></>}
    <label className="field--wide">Notas (opcional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agregá un detalle" rows={3} /></label>
    {error && <p className="form-error field--wide" role="alert">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary" type="submit">{initial ? 'Guardar cambios' : installments ? 'Crear plan de cuotas' : 'Guardar movimiento'}</button></div>
  </form>;
}
