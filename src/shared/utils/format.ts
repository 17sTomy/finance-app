import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Currency } from '../../modules/finance/domain/models';

export const formatMoney = (value: number, currency: Currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export const formatShortDate = (date: string) => format(parseISO(date), 'd MMM', { locale: es });
export const formatFullDate = (date: string) => format(parseISO(date), "d 'de' MMMM", { locale: es });
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
