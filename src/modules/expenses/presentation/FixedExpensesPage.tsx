import { Bell, BellOff, CalendarClock, Pause, Pencil, Play, Plus, Trash2, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useFinance } from '../../../app/providers/FinanceProvider';
import type { Currency, FixedExpense, RecurrenceDuration, RecurringIncome } from '../../finance/domain/models';
import { newId } from '../../finance/domain/models';
import { Card } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { ConfirmDialog, Modal } from '../../../shared/components/Modal';

function durationText(duration: RecurrenceDuration) {
  if (duration.type === 'unlimited') return 'Sin fecha de fin';
  if (duration.type === 'months') return `${duration.count} meses`;
  return `Hasta ${new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${duration.endDate}T12:00:00`))}`;
}

function FixedExpenseForm({ initial, onDone }: { initial?: FixedExpense; onDone: () => void }) {
  const { database, selectedMonth, saveFixedExpense } = useFinance();
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'ARS');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? 'housing');
  const [startDate, setStartDate] = useState(initial?.startDate ?? `${selectedMonth}-01`);
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 10));
  const [durationType, setDurationType] = useState<RecurrenceDuration['type']>(initial?.duration.type ?? 'unlimited');
  const [durationValue, setDurationValue] = useState(initial?.duration.type === 'months' ? String(initial.duration.count) : initial?.duration.type === 'until' ? initial.duration.endDate : '12');
  const [reminder, setReminder] = useState(initial?.reminderEnabled ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount); const day = Number(dueDay); const months = Number(durationValue);
    if (!name.trim()) return setError('Ingresá un nombre.');
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('Ingresá un importe válido.');
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError('El día de vencimiento debe estar entre 1 y 31.');
    if (durationType === 'months' && (!Number.isInteger(months) || months < 1)) return setError('La duración debe ser de al menos un mes.');
    if (durationType === 'until' && !/^\d{4}-\d{2}-\d{2}$/.test(durationValue)) return setError('Elegí una fecha de finalización válida.');
    const duration: RecurrenceDuration = durationType === 'months' ? { type: 'months', count: months } : durationType === 'until' ? { type: 'until', endDate: durationValue } : { type: 'unlimited' };
    saveFixedExpense({ id: initial?.id ?? newId(), name: name.trim(), amount: numericAmount, currency, categoryId, startDate, dueDay: day, duration, reminderEnabled: reminder, notes: notes.trim() || undefined, active: initial?.active ?? true });
    onDone();
  };
  return <form className="form-grid" onSubmit={submit}>
    <label className="field--wide">Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Seguro del auto" /></label>
    <label>Importe<input type="number" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
    <label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option value="ARS">ARS — Pesos</option><option value="USD">USD — Dólares</option></select></label>
    <label>Categoría<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{database.categories.filter((item) => item.kind === 'expense' || item.kind === 'all').map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    <label>Día de vencimiento<input type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>
    <label>Fecha de inicio<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
    <label>Duración<select value={durationType} onChange={(event) => setDurationType(event.target.value as RecurrenceDuration['type'])}><option value="unlimited">Ilimitado</option><option value="months">Cantidad de meses</option><option value="until">Hasta una fecha</option></select></label>
    {durationType === 'months' && <label>Cantidad de meses<input type="number" min="1" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} /></label>}
    {durationType === 'until' && <label>Fecha final<input type="date" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} /></label>}
    <label className="check-field field--wide"><input type="checkbox" checked={reminder} onChange={(event) => setReminder(event.target.checked)} /><span>Recordarme antes del vencimiento</span></label>
    <label className="field--wide">Notas (opcional)<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error && <p className="form-error field--wide">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar gasto fijo</button></div>
  </form>;
}

function SalaryForm({ initial, onDone }: { initial?: RecurringIncome; onDone: () => void }) {
  const { saveRecurringIncome } = useFinance(); const [name, setName] = useState(initial?.name ?? 'Sueldo'); const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : ''); const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'ARS'); const [startDate, setStartDate] = useState(initial?.startDate ?? '2026-08-01'); const [error, setError] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); const value = Number(amount); if (!name.trim()) return setError('Ingresá un nombre.'); if (!Number.isFinite(value) || value <= 0) return setError('Ingresá un importe válido.'); saveRecurringIncome({ id: initial?.id ?? newId(), name: name.trim(), amount: value, currency, startDate, active: initial?.active ?? true }); onDone(); };
  return <form className="form-grid" onSubmit={submit}><label className="field--wide">Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label>Importe<input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option value="ARS">ARS</option><option value="USD">USD</option></select></label><label className="field--wide">Fecha de inicio<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><p className="form-note field--wide">Se proyectará automáticamente el primer día hábil de cada mes (lunes a viernes).</p>{error && <p className="form-error field--wide">{error}</p>}<div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar ingreso recurrente</button></div></form>;
}

export function FixedExpensesPage() {
  const { database, toggleFixedExpense, deleteFixedExpense, toggleRecurringIncome } = useFinance();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | undefined>();
  const [deleting, setDeleting] = useState<FixedExpense | null>(null);
  const [salaryEditing, setSalaryEditing] = useState<RecurringIncome | null | undefined>();
  const openEdit = (item?: FixedExpense) => { setEditing(item); setFormOpen(true); };
  return <>
    <div className="page-heading"><div><p className="eyebrow">RECURRENCIAS</p><h1>Gastos fijos</h1><p>Organizá tus compromisos sin crear copias sueltas cada mes.</p></div><button className="button button--primary" onClick={() => openEdit()}><Plus size={18} /> Nuevo gasto fijo</button></div>
    <div className="fixed-stats"><Card><small>Total mensual activo</small><MoneyValue value={database.fixedExpenses.filter((item) => item.active && item.currency === 'ARS').reduce((sum, item) => sum + item.amount, 0)} className="summary-money" /></Card><Card><small>Recurrencias activas</small><strong className="summary-number">{database.fixedExpenses.filter((item) => item.active).length}</strong></Card><Card><small>Con recordatorio</small><strong className="summary-number">{database.fixedExpenses.filter((item) => item.reminderEnabled).length}</strong></Card></div>
    <div className="fixed-grid">{database.fixedExpenses.map((item) => <Card key={item.id} className={`fixed-card ${!item.active ? 'fixed-card--paused' : ''}`}>
      <div className="fixed-card__top"><span className="category-icon">{database.categories.find((category) => category.id === item.categoryId)?.icon ?? '•'}</span><span className={`status-pill ${item.active ? 'status-pill--active' : ''}`}>{item.active ? 'Activo' : 'Pausado'}</span></div>
      <h2>{item.name}</h2><MoneyValue value={item.amount} currency={item.currency} className="fixed-amount" />
      <div className="fixed-details"><span><CalendarClock size={16} /> Vence el día {item.dueDay}</span><span>{item.reminderEnabled ? <Bell size={16} /> : <BellOff size={16} />} {item.reminderEnabled ? 'Recordatorio activo' : 'Sin recordatorio'}</span><span>↻ {durationText(item.duration)}</span></div>
      <div className="fixed-actions"><button className="button button--ghost" onClick={() => toggleFixedExpense(item.id)}>{item.active ? <Pause size={16} /> : <Play size={16} />}{item.active ? 'Pausar' : 'Reactivar'}</button><button className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => openEdit(item)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar ${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={17} /></button></div>
    </Card>)}</div>
    <div className="subsection-heading"><div><p className="eyebrow">INGRESOS AUTOMÁTICOS</p><h2>Sueldo recurrente</h2></div><button className="button button--ghost" onClick={() => setSalaryEditing(null)}><Plus size={17} /> Agregar</button></div>
    <div className="fixed-grid salary-grid">{database.recurringIncomes.map((item) => <Card key={item.id} className={!item.active ? 'fixed-card--paused' : ''}><div className="fixed-card__top"><span className="category-icon"><Wallet size={19} /></span><span className={`status-pill ${item.active ? 'status-pill--active' : ''}`}>{item.active ? 'Activo' : 'Pausado'}</span></div><h2>{item.name}</h2><MoneyValue value={item.amount} currency={item.currency} className="fixed-amount" /><p className="muted small-copy">Se acredita el primer día hábil desde {new Intl.DateTimeFormat('es-AR').format(new Date(`${item.startDate}T12:00:00`))}.</p><div className="fixed-actions"><button className="button button--ghost" onClick={() => toggleRecurringIncome(item.id)}>{item.active ? <Pause size={16} /> : <Play size={16} />}{item.active ? 'Pausar' : 'Reactivar'}</button><button className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => setSalaryEditing(item)}><Pencil size={17} /></button></div></Card>)}</div>
    <Modal open={formOpen} title={editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} onClose={() => setFormOpen(false)}><FixedExpenseForm initial={editing} onDone={() => setFormOpen(false)} /></Modal>
    <Modal open={salaryEditing !== undefined} title={salaryEditing ? 'Editar sueldo recurrente' : 'Nuevo sueldo recurrente'} onClose={() => setSalaryEditing(undefined)}><SalaryForm initial={salaryEditing ?? undefined} onDone={() => setSalaryEditing(undefined)} /></Modal>
    <ConfirmDialog open={!!deleting} title="¿Eliminar la recurrencia?" message="Los meses históricos conservarán sus movimientos. La recurrencia dejará de proyectarse en meses nuevos." onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteFixedExpense(deleting.id)} />
  </>;
}
