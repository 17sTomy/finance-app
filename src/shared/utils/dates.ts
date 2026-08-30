import { format, getDaysInMonth, parseISO } from 'date-fns';

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export function clampDayToMonth(month: string, day: number) {
  return Math.max(1, Math.min(Math.trunc(day), getDaysInMonth(parseISO(`${month}-01`))));
}
