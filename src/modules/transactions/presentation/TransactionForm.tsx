import { useState, type FormEvent } from 'react';
import { useFinance } from '../../../app/providers/FinanceProvider';
import type { AssetAction, Currency, Transaction, TransactionType } from '../../finance/domain/models';
import { dollarSavingsBalance, investmentHoldings } from '../../finance/domain/financeSelectors';
import { todayISO } from '../../../shared/utils/dates';
import { categoryRoot } from '../../finance/domain/categories';

interface Props { initial?: Transaction; defaultType?: TransactionType; onDone: () => void }

export function TransactionForm({ initial, defaultType = 'expense', onDone }: Props) {
  const { database, selectedMonth, addTransaction, updateTransaction, addInstallmentPlan } = useFinance();
  const [type, setType] = useState<TransactionType>(initial?.type ?? defaultType);
  const availableCategories = database.categories.filter((item) => item.kind === type || item.kind === 'all' || item.id === initial?.categoryId);
  const mainCategories = availableCategories.filter((item) => !item.parentId);
  const initialCategory = database.categories.find((item) => item.id === initial?.categoryId);
  const initialMainCategory = initialCategory ? categoryRoot(initialCategory, database.categories) : undefined;
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? (todayISO().startsWith(selectedMonth) ? todayISO() : `${selectedMonth}-01`));
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? (defaultType === 'saving' ? 'USD' : 'ARS'));
  const [categoryId, setCategoryId] = useState(initialMainCategory?.id ?? mainCategories[0]?.id ?? '');
  const [subcategoryId, setSubcategoryId] = useState(initialCategory?.parentId ? initialCategory.id : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [investmentTicker, setInvestmentTicker] = useState(initial?.investmentTicker ?? 'SPY');
  const [investmentQuantity, setInvestmentQuantity] = useState(initial?.investmentQuantity ? String(initial.investmentQuantity) : '');
  const [assetAction, setAssetAction] = useState<AssetAction>(initial?.assetAction ?? 'buy');
  const [exchangeRate, setExchangeRate] = useState(initial?.exchangeRate != null ? String(initial.exchangeRate) : '');
  const [installments, setInstallments] = useState(false);
  const [count, setCount] = useState('3');
  const [error, setError] = useState('');
  const subcategories = availableCategories.filter((item) => item.parentId === categoryId);
  const selectedCategoryId = subcategoryId || categoryId;
  const availableDollars = dollarSavingsBalance(database, selectedMonth, initial?.id);
  const availableCedears = investmentHoldings(database, selectedMonth, initial?.id).find((holding) => holding.ticker === investmentTicker)?.quantity ?? 0;
  const isAsset = type === 'saving' || type === 'investment';
  const changeType = (next: TransactionType) => {
    const nextCategories = database.categories.filter((item) => !item.parentId && (item.kind === next || item.kind === 'all'));
    setType(next);
    setCurrency(next === 'saving' ? 'USD' : 'ARS');
    setAssetAction('buy');
    setCategoryId(nextCategories[0]?.id ?? '');
    setSubcategoryId('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    const numericQuantity = Number(investmentQuantity);
    const numericExchangeRate = Number(exchangeRate);
    const installmentCount = Number(count);
    if (!name.trim()) return setError('Ingresá un nombre.');
    if (!selectedCategoryId) return setError('Elegí una categoría. Si todavía no tenés una, creala desde Planificación.');
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('El importe debe ser mayor a cero.');
    if (type === 'saving' && (exchangeRate.trim() === '' || !Number.isFinite(numericExchangeRate) || numericExchangeRate < 0 || (assetAction === 'sell' && numericExchangeRate <= 0))) return setError('Ingresá el tipo de cambio en pesos.');
    if (type === 'saving' && assetAction === 'sell' && numericAmount > availableDollars) return setError(`Solo tenés USD ${availableDollars.toLocaleString('es-AR')} disponibles para vender.`);
    if (type === 'investment' && (!Number.isFinite(numericQuantity) || numericQuantity <= 0)) return setError('Ingresá una cantidad válida de CEDEARs.');
    if (type === 'investment' && assetAction === 'sell' && numericQuantity > availableCedears) return setError(`Solo tenés ${availableCedears.toLocaleString('es-AR')} ${investmentTicker} disponibles para vender.`);
    if (!date || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) return setError('Elegí una fecha válida.');
    if (installments && (!Number.isInteger(installmentCount) || installmentCount < 2 || installmentCount > 120)) return setError('Las cuotas deben ser entre 2 y 120.');
    if (installments && type === 'expense' && !initial) {
      addInstallmentPlan({ description: name.trim(), totalAmount: numericAmount, installmentCount, firstInstallmentDate: date, currency, categoryId: selectedCategoryId, notes: notes.trim() || undefined });
    } else {
      const value = {
        name: name.trim(), amount: numericAmount, date,
        currency: type === 'saving' ? 'USD' as const : type === 'investment' ? 'ARS' as const : currency,
        categoryId: selectedCategoryId, notes: notes.trim() || undefined, type,
        expenseType: type === 'expense' ? initial?.expenseType ?? 'variable' as const : undefined,
        investmentTicker: type === 'investment' ? investmentTicker : undefined,
        investmentQuantity: type === 'investment' ? numericQuantity : undefined,
        assetAction: isAsset ? assetAction : undefined,
        exchangeRate: type === 'saving' ? numericExchangeRate : undefined,
      };
      if (initial) updateTransaction({ ...initial, ...value }); else addTransaction(value);
    }
    onDone();
  };

  return <form onSubmit={submit} className="form-grid" noValidate>
    {initial?.recurrenceId && <p className="form-note field--wide">Estás editando solo esta ocurrencia histórica. Para cambiar esta y las siguientes, editá la recurrencia desde Gastos fijos.</p>}
    {initial?.installmentPlanId && <p className="form-note field--wide">El nuevo importe se aplicará a esta cuota y a las siguientes. Las cuotas anteriores no se modifican.</p>}
    {!initial && <label>Tipo<select value={type} onChange={(event) => changeType(event.target.value as TransactionType)}><option value="expense">Gasto</option><option value="income">Ingreso extra</option><option value="saving">Ahorro en dólares</option><option value="investment">Inversión</option></select></label>}
    <label className={!initial && !isAsset ? '' : 'field--wide'}>Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'saving' ? assetAction === 'buy' ? 'Ej. Compra de dólares' : 'Ej. Venta de dólares' : type === 'investment' ? `${assetAction === 'buy' ? 'Compra' : 'Venta'} ${investmentTicker}` : 'Ej. Supermercado'} autoFocus /></label>
    {isAsset && <label>Operación<select value={assetAction} onChange={(event) => setAssetAction(event.target.value as AssetAction)}><option value="buy">Compra</option><option value="sell">Venta</option></select></label>}
    <label>{type === 'saving' ? 'Cantidad de dólares' : type === 'investment' ? assetAction === 'buy' ? 'Monto invertido' : 'Pesos recibidos' : 'Importe'}<input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
    <label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{type === 'saving' ? <option value="USD">USD — Dólares</option> : type === 'investment' ? <option value="ARS">ARS — Pesos</option> : <><option value="ARS">ARS — Pesos</option><option value="USD">USD — Dólares</option></>}</select></label>
    {type === 'saving' && <><label>Tipo de cambio (ARS por USD)<input type="number" inputMode="decimal" min={assetAction === 'buy' ? '0' : '0.01'} step="0.01" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} placeholder="Ej. 1500" /></label><div className="calculated-value"><small>{assetAction === 'buy' ? 'Se descontarán' : 'Se acreditarán'}</small><strong>{Number(amount) > 0 && exchangeRate.trim() !== '' && Number(exchangeRate) >= 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(amount) * Number(exchangeRate)) : '—'}</strong></div>{assetAction === 'sell' && <p className="form-note field--wide">Disponible para vender: USD {availableDollars.toLocaleString('es-AR')}</p>}</>}
    {type === 'investment' && <><label>CEDEAR<select value={investmentTicker} onChange={(event) => setInvestmentTicker(event.target.value)}><option value="SPY">SPY — S&amp;P 500</option><option value="EWZ">EWZ — Brasil</option><option value="AAPL">AAPL — Apple</option><option value="AMZN">AMZN — Amazon</option><option value="KO">KO — Coca-Cola</option><option value="XOM">XOM — Exxon Mobil</option><option value="GOOGL">GOOGL — Google</option><option value="NVDA">NVDA — Nvidia</option><option value="MSFT">MSFT — Microsoft</option></select></label><label>Cantidad<input type="number" min="0.0001" step="0.0001" value={investmentQuantity} onChange={(event) => setInvestmentQuantity(event.target.value)} /></label>{assetAction === 'sell' && <p className="form-note field--wide">Disponible para vender: {availableCedears.toLocaleString('es-AR')} {investmentTicker}</p>}</>}
    <label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label>Categoría<select aria-label="Categoría" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(''); }}><option value="" disabled>Elegí una categoría</option>{mainCategories.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    <label>Subcategoría (opcional)<select aria-label="Subcategoría (opcional)" value={subcategoryId} disabled={!categoryId || subcategories.length === 0} onChange={(event) => setSubcategoryId(event.target.value)}><option value="">{subcategories.length === 0 ? 'Esta categoría no tiene subcategorías' : 'Ninguna — usar categoría principal'}</option>{subcategories.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    {!initial && type === 'expense' && <label className="check-field field--wide"><input type="checkbox" checked={installments} onChange={(event) => setInstallments(event.target.checked)} /><span>Es una compra en cuotas</span></label>}
    {installments && <><label>Cantidad de cuotas<input type="number" min="2" max="120" value={count} onChange={(event) => setCount(event.target.value)} /></label><div className="calculated-value"><small>Valor por cuota</small><strong>{Number(amount) > 0 && Number(count) > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount) / Number(count)) : '—'}</strong></div></>}
    <label className="field--wide">Notas (opcional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agregá un detalle" rows={3} /></label>
    {error && <p className="form-error field--wide" role="alert">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary" type="submit">{initial ? 'Guardar cambios' : installments ? 'Crear plan de cuotas' : 'Guardar movimiento'}</button></div>
  </form>;
}
