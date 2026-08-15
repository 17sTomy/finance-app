import { addDays, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import { CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useFinance } from '../../../app/providers/FinanceProvider';
import type { CalendarEvent, Transaction } from '../../finance/domain/models';
import { newId } from '../../finance/domain/models';
import { Card, SectionHeader } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { Modal } from '../../../shared/components/Modal';
import { formatFullDate } from '../../../shared/utils/format';

type FinancialEvent = { id: string; title: string; date: string; type: 'income' | 'expense' | 'installment' | 'goal' | 'manual'; transaction?: Transaction; description?: string };

function EventForm({ initial, selectedMonth, onSave, onDone }: { initial?: CalendarEvent; selectedMonth: string; onSave: (event: CalendarEvent) => void; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? ''); const [date, setDate] = useState(initial?.date ?? `${selectedMonth}-15`); const [description, setDescription] = useState(initial?.description ?? ''); const [error, setError] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return setError('Ingresá un título.'); if (!date.startsWith(selectedMonth)) return setError('La fecha debe pertenecer al mes seleccionado.'); onSave({ id: initial?.id ?? newId(), title: title.trim(), date, description: description.trim() || undefined, type: 'manual' }); onDone(); };
  return <form className="form-grid" onSubmit={submit}><label className="field--wide">Título<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Renovar seguro" /></label><label className="field--wide">Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field--wide">Descripción (opcional)<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{error && <p className="form-error field--wide">{error}</p>}<div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar evento</button></div></form>;
}

export function CalendarPage() {
  const { monthData, database, selectedMonth, saveEvent, deleteEvent } = useFinance();
  const [selectedDay, setSelectedDay] = useState(15); const [editing, setEditing] = useState<CalendarEvent | null | undefined>();
  const events = useMemo<FinancialEvent[]>(() => {
    const transactionEvents = monthData.transactions.filter((item) => item.recurrenceId || item.installmentPlanId).map((item) => ({ id: item.id, title: item.name, date: item.date, type: item.installmentPlanId ? 'installment' as const : item.type === 'income' ? 'income' as const : 'expense' as const, transaction: item }));
    const goalEvents = database.goals.filter((goal) => goal.targetDate?.startsWith(selectedMonth)).map((goal) => ({ id: `goal-${goal.id}`, title: `Meta: ${goal.name}`, date: goal.targetDate!, type: 'goal' as const }));
    const manualEvents = monthData.events.map((item) => ({ ...item, type: 'manual' as const }));
    return [...transactionEvents, ...goalEvents, ...manualEvents];
  }, [monthData, database.goals, selectedMonth]);
  const first = startOfMonth(parseISO(`${selectedMonth}-01`)); const last = endOfMonth(first); const leading = (getDay(first) + 6) % 7; const cells = Array.from({ length: Math.ceil((leading + last.getDate()) / 7) * 7 }, (_, index) => index - leading + 1);
  const selectedEvents = events.filter((item) => Number(item.date.slice(8, 10)) === selectedDay);
  return <>
    <div className="page-heading"><div><p className="eyebrow">AGENDA FINANCIERA</p><h1>Calendario</h1><p>Vencimientos, cuotas y recordatorios en contexto.</p></div><button className="button button--primary" onClick={() => setEditing(null)}><Plus size={18} /> Agregar evento</button></div>
    <div className="calendar-layout"><Card className="calendar-card"><div className="calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { const valid = day >= 1 && day <= last.getDate(); const dayEvents = valid ? events.filter((item) => Number(item.date.slice(8, 10)) === day) : []; const today = valid && format(addDays(first, day - 1), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'); return <button key={index} disabled={!valid} className={`${selectedDay === day ? 'selected' : ''} ${today ? 'today' : ''}`} onClick={() => valid && setSelectedDay(day)}><span>{valid ? day : ''}</span><div className="calendar-dots">{dayEvents.slice(0, 3).map((event) => <i key={event.id} className={`dot dot--${event.type}`} />)}</div><div className="calendar-event-labels">{dayEvents.slice(0, 2).map((event) => <small key={event.id} className={`event-label event-label--${event.type}`}>{event.title}{event.transaction?.installmentNumber ? ` ${event.transaction.installmentNumber}/${event.transaction.installmentCount}` : ''}</small>)}</div></button>; })}</div></Card>
      <Card className="day-panel"><SectionHeader title={formatFullDate(`${selectedMonth}-${String(selectedDay).padStart(2, '0')}`)} /><div className="day-events">{selectedEvents.length === 0 ? <div className="empty-day"><CalendarPlus size={28} /><p>No hay eventos para este día.</p></div> : selectedEvents.map((event) => <div className="day-event" key={event.id}><i className={`dot dot--${event.type}`} /><div><strong>{event.title}{event.transaction?.installmentNumber ? ` · Cuota ${event.transaction.installmentNumber}/${event.transaction.installmentCount}` : ''}</strong><small>{event.description ?? (event.type === 'expense' ? 'Gasto fijo' : event.type === 'income' ? 'Ingreso recurrente' : event.type === 'installment' ? 'Compra en cuotas' : event.type === 'goal' ? 'Fecha objetivo' : 'Evento personal')}</small></div>{event.transaction && <MoneyValue value={event.transaction.amount} currency={event.transaction.currency} />}{event.type === 'manual' && <div className="row-actions"><button className="icon-button" aria-label={`Editar ${event.title}`} onClick={() => setEditing(monthData.events.find((item) => item.id === event.id))}><Pencil size={16} /></button><button className="icon-button" aria-label={`Eliminar ${event.title}`} onClick={() => deleteEvent(event.id)}><Trash2 size={16} /></button></div>}</div>)}</div><button className="button button--soft button--full" onClick={() => setEditing(null)}><Plus size={17} /> Agregar evento este mes</button></Card>
    </div>
    <Modal open={editing !== undefined} title={editing ? 'Editar evento' : 'Nuevo evento'} onClose={() => setEditing(undefined)}><EventForm initial={editing ?? undefined} selectedMonth={selectedMonth} onSave={saveEvent} onDone={() => setEditing(undefined)} /></Modal>
  </>;
}
