import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Bell, CalendarClock, X } from 'lucide-react';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { MoneyValue } from '../../../shared/components/MoneyValue';

export function ReminderCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { monthData, database, selectedMonth } = useFinance();
  if (!open) return null;
  const reference = selectedMonth === format(new Date(), 'yyyy-MM') ? new Date() : parseISO(`${selectedMonth}-01`);
  const reminders = monthData.transactions.filter((item) => {
    if (item.installmentPlanId) return true;
    const fixed = item.recurrenceId && database.fixedExpenses.find((expense) => expense.id === item.recurrenceId);
    return !!fixed && fixed.reminderEnabled;
  }).sort((a, b) => a.date.localeCompare(b.date));
  return <div className="reminder-popover" role="dialog" aria-label="Centro de recordatorios"><div className="reminder-header"><div><Bell size={18} /><strong>Recordatorios</strong></div><button className="icon-button" aria-label="Cerrar recordatorios" onClick={onClose}><X size={18} /></button></div><div className="reminder-list">{reminders.length === 0 ? <p className="muted">No tenés recordatorios este mes.</p> : reminders.map((item) => { const days = differenceInCalendarDays(parseISO(item.date), reference); const timing = days === 0 ? 'vence hoy' : days === 1 ? 'vence mañana' : days > 1 ? `vence en ${days} días` : 'ya venció'; return <div key={item.id} className="reminder-item"><span><CalendarClock size={17} /></span><div><strong>{item.name}{item.installmentNumber ? ` · Cuota ${item.installmentNumber}/${item.installmentCount}` : ''}</strong><small>{timing}</small></div><MoneyValue value={item.amount} currency={item.currency} /></div>; })}</div></div>;
}
