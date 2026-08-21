import { ArrowDownRight, ArrowUpRight, BellRing, CircleDollarSign, Landmark, Plus, PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { calculateSummary, dollarSavingsBalance, expensesByCategory, goalSavedAmount, goalTargetAmount, investmentHoldings, limitProgress } from '../../finance/domain/financeSelectors';
import type { Transaction, TransactionType } from '../../finance/domain/models';
import { projectFixedExpense } from '../../finance/domain/projections';
import { fetchCedearQuotes, type CedearQuote } from '../../investments/infrastructure/marketData';
import { Card, SectionHeader } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { Modal } from '../../../shared/components/Modal';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { TransactionForm } from '../../transactions/presentation/TransactionForm';
import { formatShortDate } from '../../../shared/utils/format';
import { todayISO } from '../../../shared/utils/dates';

const isIncoming = (item: Transaction) => item.type === 'income' || ((item.type === 'saving' || item.type === 'investment') && item.assetAction === 'sell');
const displayedMovement = (item: Transaction) => item.type === 'saving' && item.exchangeRate
  ? { value: (item.assetAction === 'sell' ? 1 : -1) * item.amount * item.exchangeRate, currency: 'ARS' as const }
  : { value: isIncoming(item) ? item.amount : -item.amount, currency: item.currency };

export function DashboardPage() {
  const { database, monthData, selectedMonth } = useFinance();
  const [formOpen, setFormOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<TransactionType>('expense');
  const [included, setIncluded] = useState<TransactionType[]>(['expense']);
  const [quotes, setQuotes] = useState<CedearQuote[]>([]);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState('');
  const summary = calculateSummary(monthData.transactions);
  const dollarBalance = dollarSavingsBalance(database, selectedMonth);
  const previousDate = new Date(`${selectedMonth}-01T12:00:00`); previousDate.setMonth(previousDate.getMonth() - 1);
  const previous = database.months[`${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`];
  const previousSummary = previous ? calculateSummary(previous.transactions) : null;
  const change = previousSummary && previousSummary.balance ? ((summary.balance - previousSummary.balance) / Math.abs(previousSummary.balance)) * 100 : 0;
  const categoryData = useMemo(() => expensesByCategory(monthData.transactions, database.categories, included), [monthData.transactions, database.categories, included]);
  const holdings = useMemo(() => investmentHoldings(database, selectedMonth), [database, selectedMonth]);
  const symbolKey = holdings.filter((item) => item.ticker !== 'SIN TICKER').map((item) => item.ticker).sort().join(',');
  useEffect(() => {
    const controller = new AbortController();
    const symbols = symbolKey ? symbolKey.split(',') : [];
    fetchCedearQuotes(symbols, controller.signal).then((result) => {
      setQuotes(result);
      if (result.length > 0) setQuoteUpdatedAt(new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
    }).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setQuotes([]); });
    return () => controller.abort();
  }, [symbolKey]);
  const quoteByTicker = new Map(quotes.map((quote) => [quote.ticker, quote]));
  const investmentValue = holdings.reduce((total, holding) => {
    const price = quoteByTicker.get(holding.ticker)?.price;
    return total + (price && holding.quantity > 0 ? price * holding.quantity : Math.max(holding.investedAmount, 0));
  }, 0);
  const upcoming = database.fixedExpenses
    .map((item) => projectFixedExpense(item, monthData.year, monthData.month))
    .filter((item): item is Transaction => item !== null && item.date >= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date));
  const monthMovements = [...monthData.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const openForm = (type: TransactionType) => { setDefaultType(type); setFormOpen(true); };

  return <>
    <div className="page-heading"><div><p className="eyebrow">TU MES EN CALMA</p><h1>Hola, Titu <span>👋</span></h1><p>Un vistazo simple a lo que entra, sale y crece.</p></div><button className="button button--primary" onClick={() => openForm('expense')}><Plus size={18} /> Nuevo movimiento</button></div>
    <div className="summary-grid">
      <Card accent className="balance-card"><div className="card-label"><span>Balance disponible</span><Wallet size={19} /></div><MoneyValue value={summary.balance} className="hero-money" /><div className="trend-pill"><TrendingUp size={14} /> {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs. mes anterior</div><div className="balance-orb balance-orb--one" /><div className="balance-orb balance-orb--two" /></Card>
      <Card><div className="card-label"><span>Ingresos</span><span className="soft-icon soft-icon--green"><ArrowUpRight size={18} /></span></div><MoneyValue value={summary.income} className="summary-money" /><div className="mini-breakdown"><span>Sueldo</span><MoneyValue value={monthData.transactions.filter((item) => item.type === 'income' && !!item.recurrenceId).reduce((sum, item) => sum + item.amount, 0)} /><span>Extras</span><MoneyValue value={monthData.transactions.filter((item) => item.type === 'income' && !item.recurrenceId).reduce((sum, item) => sum + item.amount, 0)} /></div></Card>
      <Card><div className="card-label"><span>Gastos</span><span className="soft-icon soft-icon--coral"><ArrowDownRight size={18} /></span></div><MoneyValue value={summary.expenses} className="summary-money" /><div className="mini-breakdown"><span>Fijos</span><MoneyValue value={summary.fixedExpenses} /><span>Variables</span><MoneyValue value={summary.variableExpenses} /><span>Compras de activos</span><MoneyValue value={summary.assetPurchases} /></div></Card>
      <Card className="savings-summary"><div className="metric-row"><span className="soft-icon soft-icon--green"><PiggyBank size={19} /></span><div><small>Tenencia acumulada USD</small><MoneyValue value={dollarBalance} currency="USD" /></div></div><div className="metric-row"><span className="soft-icon soft-icon--blue"><Landmark size={19} /></span><div><small>CEDEARs · valor actual</small><MoneyValue value={investmentValue} /></div></div>{holdings.length > 0 && <div className="portfolio-prices">{holdings.filter((item) => item.ticker !== 'SIN TICKER').map((holding) => { const quote = quoteByTicker.get(holding.ticker); return <span key={holding.ticker}><strong>{holding.ticker}</strong> · {holding.quantity.toLocaleString('es-AR')} u. · {quote ? <MoneyValue value={quote.price} /> : 'costo registrado'}</span>; })}<small>{quoteUpdatedAt ? `Último precio disponible · ${quoteUpdatedAt}` : 'Cotización no disponible · se usa el costo registrado'}</small></div>}<div className="summary-actions"><button className="text-button" onClick={() => openForm('saving')}>Comprar/vender USD</button><button className="text-button" onClick={() => openForm('investment')}>Comprar/vender CEDEAR</button></div></Card>
    </div>

    <div className="dashboard-main-grid">
      <Card className="category-card"><SectionHeader title="Gastos por categoría" /><div className="type-toggles">{(['expense', 'saving', 'investment'] as TransactionType[]).map((type) => <label key={type}><input type="checkbox" checked={included.includes(type)} onChange={() => setIncluded((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} /><span>{type === 'expense' ? 'Gastos' : type === 'saving' ? 'Ahorro USD' : 'Inversiones'}</span></label>)}</div><div className="chart-and-legend"><div className="donut"><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={categoryData} dataKey="value" innerRadius={82} outerRadius={116} paddingAngle={3} stroke="none">{categoryData.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value))} /></PieChart></ResponsiveContainer><div className="donut__center"><small>Total</small><MoneyValue value={categoryData.reduce((sum, item) => sum + item.value, 0)} /></div></div><div className="chart-legend">{categoryData.slice(0, 8).map((item) => <div key={item.id}><span style={{ background: item.color }} /><div><small>{item.name}</small><MoneyValue value={item.value} /></div></div>)}</div></div></Card>
      <div className="stacked-column">
        <Card><SectionHeader title="Límites del mes" action={<Link to="/planificacion?tab=limits" className="text-button">Gestionar</Link>} /><div className="progress-list">{monthData.limits.map((limit) => { const category = database.categories.find((item) => item.id === limit.categoryId); const progress = limitProgress(limit, monthData); return <div key={limit.id} className="progress-item"><div><strong>{category?.name ?? 'Categoría'}</strong><span><MoneyValue value={progress.spent} /> / <MoneyValue value={progress.limitAmount} /> ({progress.configuredPercentage.toFixed(1)}%)</span></div><ProgressBar value={progress.percentage} color={category?.color} /><small>{Math.round(progress.percentage)}% utilizado</small></div>; })}</div></Card>
        <Card><SectionHeader title="Objetivos de ahorro" action={<Link to="/planificacion?tab=goals" className="text-button">Ver todos</Link>} /><div className="goal-list">{database.goals.slice(0, 2).map((goal) => { const saved = goalSavedAmount(goal, selectedMonth); const target = goalTargetAmount(goal, monthData); const progress = target > 0 ? saved / target * 100 : 0; return <div key={goal.id} className="goal-row"><div className="goal-icon" style={{ background: `${goal.color}22`, color: goal.color }}><CircleDollarSign size={20} /></div><div className="goal-content"><div><strong>{goal.name}</strong><span>{Math.round(progress)}%</span></div><ProgressBar value={progress} color={goal.color} /><small><MoneyValue value={saved} currency={goal.currency} /> de <MoneyValue value={target} currency={goal.currency} />{goal.targetMode === 'salaryPercentage' ? ` (${goal.salaryPercentage}%)` : ''}</small></div></div>; })}</div></Card>
      </div>
    </div>

    <Card className="upcoming-card"><SectionHeader title="Próximos pagos" action={<Link to="/fijos" className="text-button">Ver gastos fijos</Link>} />{upcoming.length === 0 ? <p className="muted compact-empty">No quedan pagos fijos por vencer en el período seleccionado.</p> : <div className="upcoming-grid">{upcoming.map((item) => <div key={item.id} className="upcoming-item"><span className="category-icon">{database.categories.find((cat) => cat.id === item.categoryId)?.icon ?? '•'}</span><div><strong>{item.name}</strong><small><BellRing size={13} /> Vence {formatShortDate(item.date)}</small></div><MoneyValue value={item.amount} currency={item.currency} /></div>)}</div>}</Card>
    <Card className="month-movements-card"><SectionHeader title="Movimientos del mes" action={<Link to="/movimientos" className="text-button">Abrir movimientos</Link>} />{monthMovements.length === 0 ? <p className="muted compact-empty">Todavía no hay movimientos registrados en este mes.</p> : <div className="month-movements">{monthMovements.map((item) => <div className="month-movement-row" key={item.id}><span className={`transaction-icon transaction-icon--${item.type}`}>{isIncoming(item) ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span><div><strong>{item.name}</strong><small>{formatShortDate(item.date)}{item.installmentNumber ? ` · Cuota ${item.installmentNumber}/${item.installmentCount}` : ''}{item.investmentTicker ? ` · ${item.investmentQuantity} ${item.investmentTicker}` : ''}{item.exchangeRate ? ` · USD ${item.amount.toLocaleString('es-AR')}` : ''}</small></div><MoneyValue value={displayedMovement(item).value} currency={displayedMovement(item).currency} signed /></div>)}</div>}</Card>
    <Modal open={formOpen} title="Nuevo movimiento" onClose={() => setFormOpen(false)}><TransactionForm defaultType={defaultType} onDone={() => setFormOpen(false)} /></Modal>
  </>;
}
