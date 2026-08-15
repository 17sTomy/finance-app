import { ArrowDownRight, ArrowUpRight, BellRing, CircleDollarSign, Landmark, Plus, PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { calculateSummary, expensesByCategory, goalTotal, limitProgress } from '../../finance/domain/financeSelectors';
import type { TransactionType } from '../../finance/domain/models';
import { Card, SectionHeader } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { Modal } from '../../../shared/components/Modal';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { TransactionForm } from '../../transactions/presentation/TransactionForm';
import { formatShortDate } from '../../../shared/utils/format';

export function DashboardPage() {
  const { database, monthData, selectedMonth } = useFinance();
  const [formOpen, setFormOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<TransactionType>('expense');
  const [included, setIncluded] = useState<TransactionType[]>(['expense']);
  const summary = calculateSummary(monthData.transactions);
  const usdSummary = calculateSummary(monthData.transactions, 'USD');
  const previousDate = new Date(`${selectedMonth}-01T12:00:00`); previousDate.setMonth(previousDate.getMonth() - 1);
  const previous = database.months[`${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`];
  const previousSummary = previous ? calculateSummary(previous.transactions) : null;
  const change = previousSummary && previousSummary.balance ? ((summary.balance - previousSummary.balance) / Math.abs(previousSummary.balance)) * 100 : 0;
  const categoryData = useMemo(() => expensesByCategory(monthData.transactions, database.categories, included), [monthData.transactions, database.categories, included]);
  const upcoming = monthData.transactions.filter((item) => item.expenseType === 'fixed' && item.recurrenceId).sort((a, b) => a.date.localeCompare(b.date));
  const openForm = (type: TransactionType) => { setDefaultType(type); setFormOpen(true); };

  return <>
    <div className="page-heading"><div><p className="eyebrow">TU MES EN CALMA</p><h1>Hola, Titu <span>👋</span></h1><p>Un vistazo simple a lo que entra, sale y crece.</p></div><button className="button button--primary" onClick={() => openForm('expense')}><Plus size={18} /> Nuevo movimiento</button></div>
    <div className="summary-grid">
      <Card accent className="balance-card"><div className="card-label"><span>Balance disponible</span><Wallet size={19} /></div><MoneyValue value={summary.balance} className="hero-money" /><div className="trend-pill"><TrendingUp size={14} /> {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs. mes anterior</div><div className="balance-orb balance-orb--one" /><div className="balance-orb balance-orb--two" /></Card>
      <Card><div className="card-label"><span>Ingresos</span><span className="soft-icon soft-icon--green"><ArrowUpRight size={18} /></span></div><MoneyValue value={summary.income} className="summary-money" /><div className="mini-breakdown"><span>Sueldo</span><MoneyValue value={monthData.transactions.filter((item) => item.type === 'income' && !!item.recurrenceId).reduce((sum, item) => sum + item.amount, 0)} /><span>Extras</span><MoneyValue value={monthData.transactions.filter((item) => item.type === 'income' && !item.recurrenceId).reduce((sum, item) => sum + item.amount, 0)} /></div></Card>
      <Card><div className="card-label"><span>Gastos</span><span className="soft-icon soft-icon--coral"><ArrowDownRight size={18} /></span></div><MoneyValue value={summary.expenses} className="summary-money" /><div className="mini-breakdown"><span>Fijos</span><MoneyValue value={summary.fixedExpenses} /><span>Variables</span><MoneyValue value={summary.variableExpenses} /></div></Card>
      <Card className="savings-summary"><div className="metric-row"><span className="soft-icon"><PiggyBank size={19} /></span><div><small>Ahorro ARS</small><MoneyValue value={summary.savings} /></div></div><div className="metric-row"><span className="soft-icon soft-icon--green"><PiggyBank size={19} /></span><div><small>Ahorro USD</small><MoneyValue value={usdSummary.savings} currency="USD" /></div></div><div className="metric-row"><span className="soft-icon soft-icon--blue"><Landmark size={19} /></span><div><small>Inversión</small><MoneyValue value={summary.investments} /></div></div><button className="text-button" onClick={() => openForm('saving')}>+ Registrar ahorro</button></Card>
    </div>

    <div className="dashboard-main-grid">
      <Card className="category-card"><SectionHeader title="Gastos por categoría" /><div className="type-toggles">{(['expense', 'saving', 'investment'] as TransactionType[]).map((type) => <label key={type}><input type="checkbox" checked={included.includes(type)} onChange={() => setIncluded((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} /><span>{type === 'expense' ? 'Gastos' : type === 'saving' ? 'Ahorro' : 'Inversiones'}</span></label>)}</div><div className="chart-and-legend"><div className="donut"><ResponsiveContainer width="100%" height={240}><PieChart><Pie data={categoryData} dataKey="value" innerRadius={67} outerRadius={94} paddingAngle={3} stroke="none">{categoryData.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value))} /></PieChart></ResponsiveContainer><div className="donut__center"><small>Total</small><MoneyValue value={categoryData.reduce((sum, item) => sum + item.value, 0)} /></div></div><div className="chart-legend">{categoryData.slice(0, 6).map((item) => <div key={item.id}><span style={{ background: item.color }} /><div><small>{item.name}</small><MoneyValue value={item.value} /></div></div>)}</div></div></Card>
      <div className="stacked-column">
        <Card><SectionHeader title="Límites del mes" action={<a href="/planificacion" className="text-button">Gestionar</a>} /><div className="progress-list">{monthData.limits.map((limit) => { const category = database.categories.find((item) => item.id === limit.categoryId); const progress = limitProgress(limit, monthData); return <div key={limit.id} className="progress-item"><div><strong>{category?.name ?? 'Categoría'}</strong><span><MoneyValue value={progress.spent} /> / <MoneyValue value={limit.amount} /></span></div><ProgressBar value={progress.percentage} color={category?.color} /><small>{Math.round(progress.percentage)}% utilizado</small></div>; })}</div></Card>
        <Card><SectionHeader title="Objetivos de ahorro" action={<a href="/planificacion" className="text-button">Ver todos</a>} /><div className="goal-list">{database.goals.slice(0, 2).map((goal) => { const saved = goalTotal(goal.contributions); return <div key={goal.id} className="goal-row"><div className="goal-icon" style={{ background: `${goal.color}22`, color: goal.color }}><CircleDollarSign size={20} /></div><div className="goal-content"><div><strong>{goal.name}</strong><span>{Math.round(saved / goal.targetAmount * 100)}%</span></div><ProgressBar value={saved / goal.targetAmount * 100} color={goal.color} /><small><MoneyValue value={saved} currency={goal.currency} /> de <MoneyValue value={goal.targetAmount} currency={goal.currency} /></small></div></div>; })}</div></Card>
      </div>
    </div>

    <Card className="upcoming-card"><SectionHeader title="Próximos pagos" action={<a href="/fijos" className="text-button">Ver gastos fijos</a>} /><div className="upcoming-grid">{upcoming.map((item) => <div key={item.id} className="upcoming-item"><span className="category-icon">{database.categories.find((cat) => cat.id === item.categoryId)?.icon ?? '•'}</span><div><strong>{item.name}</strong><small><BellRing size={13} /> Vence {formatShortDate(item.date)}</small></div><MoneyValue value={item.amount} currency={item.currency} /></div>)}</div></Card>

    <Modal open={formOpen} title="Nuevo movimiento" onClose={() => setFormOpen(false)}><TransactionForm defaultType={defaultType} onDone={() => setFormOpen(false)} /></Modal>
  </>;
}
