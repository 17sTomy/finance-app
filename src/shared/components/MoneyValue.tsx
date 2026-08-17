import type { Currency } from '../../modules/finance/domain/models';
import { useFinance } from '../../app/providers/FinanceProvider';
import { formatMoney } from '../utils/format';

export function MoneyValue({ value, currency = 'ARS', signed, className = '' }: { value: number; currency?: Currency; signed?: boolean; className?: string }) {
  const { showAmounts } = useFinance();
  if (!showAmounts) return <span className={className} aria-label="Importe oculto">{currency === 'USD' ? 'U$D ••••' : '$••••'}</span>;
  const prefix = signed && value > 0 ? '+' : '';
  return <span className={className}>{prefix}{formatMoney(value, currency)}</span>;
}
