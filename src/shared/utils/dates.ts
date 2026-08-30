import { format, getDaysInMonth, isValid, parseISO } from 'date-fns';

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export function clampDayToMonth(month: string, day: number) {
  return Math.max(1, Math.min(Math.trunc(day), getDaysInMonth(parseISO(`${month}-01`))));
}

export function isValidISODate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
}

export function dateForSelectedMonth(selectedMonth: string, today = todayISO()) {
  return isValidISODate(today) && today.startsWith(`${selectedMonth}-`) ? today : `${selectedMonth}-01`;
}
