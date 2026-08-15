import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isSameMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useFinance } from '../../app/providers/FinanceProvider';
import { capitalize } from '../utils/format';

export function MonthSelector() {
  const { selectedMonth, changeMonth } = useFinance();
  const date = parseISO(`${selectedMonth}-01`);
  const isCurrent = isSameMonth(date, new Date());
  return <div className="month-selector" aria-label="Selector de mes">
    <button className="icon-button" aria-label="Mes anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button>
    <div><strong>{capitalize(format(date, 'MMMM yyyy', { locale: es }))}</strong>{isCurrent && <span>Actual</span>}</div>
    <button className="icon-button" aria-label="Mes siguiente" onClick={() => changeMonth(1)}><ChevronRight size={19} /></button>
  </div>;
}
