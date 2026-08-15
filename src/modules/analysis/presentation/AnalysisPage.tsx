import { ArrowDownRight, ArrowUpRight, Landmark, PiggyBank, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { calculateSummary, dailyBalance, expensesByCategory } from '../../finance/domain/financeSelectors';
import { Card, SectionHeader } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { formatMoney } from '../../../shared/utils/format';

export function AnalysisPage() {
  const { database, monthData, selectedMonth } = useFinance();
  const summary = calculateSummary(monthData.transactions);
  const categories = expensesByCategory(monthData.transactions, database.categories);
  const daily = dailyBalance(monthData.transactions);
  const previousDate = new Date(`${selectedMonth}-01T12:00:00`); previousDate.setMonth(previousDate.getMonth() - 1);
  const previousKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
  const previous = database.months[previousKey] ? calculateSummary(database.months[previousKey].transactions) : null;
  const comparison = [
    { label: 'Ingresos', actual: summary.income, anterior: previous?.income ?? 0 },
    { label: 'Gastos', actual: summary.expenses, anterior: previous?.expenses ?? 0 },
    { label: 'Ahorro', actual: summary.savings, anterior: previous?.savings ?? 0 },
  ];
  const savingsRate = summary.income > 0 ? summary.savings / summary.income * 100 : 0;
  return <>
    <div className="page-heading"><div><p className="eyebrow">LECTURA DEL MES</p><h1>Análisis mensual</h1><p>Señales claras para tomar mejores decisiones.</p></div></div>
    <div className="analysis-kpis"><Card><span className="soft-icon soft-icon--green"><ArrowUpRight size={18} /></span><small>Ingresos totales</small><MoneyValue value={summary.income} /></Card><Card><span className="soft-icon soft-icon--coral"><ArrowDownRight size={18} /></span><small>Gastos totales</small><MoneyValue value={summary.expenses} /></Card><Card><span className="soft-icon"><PiggyBank size={18} /></span><small>Ahorro</small><MoneyValue value={summary.savings} /></Card><Card><span className="soft-icon soft-icon--blue"><Landmark size={18} /></span><small>Inversiones</small><MoneyValue value={summary.investments} /></Card><Card className="analysis-balance"><span className="soft-icon"><Wallet size={18} /></span><small>Balance</small><MoneyValue value={summary.balance} /></Card></div>
    <div className="analysis-grid">
      <Card className="chart-card chart-card--wide"><SectionHeader title="Evolución del balance" /><p className="chart-subtitle">Cómo se movió tu disponible durante el mes</p><ResponsiveContainer width="100%" height={280}><LineChart data={daily} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}><defs><linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#b7a8e5"/><stop offset="1" stopColor="#7564b7"/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#ebe7f1" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#898394', fontSize: 11 }} interval={4} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#898394', fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatMoney(Number(value))} labelFormatter={(label) => `Día ${label}`} /><Line type="monotone" dataKey="balance" stroke="url(#line)" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#7564b7' }} /></LineChart></ResponsiveContainer></Card>
      <Card className="savings-rate-card"><SectionHeader title="Tasa de ahorro" /><div className="rate-ring" style={{ '--rate': `${Math.min(savingsRate, 100) * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.round(savingsRate)}%</strong><small>de ingresos</small></div></div><p>{savingsRate >= 20 ? 'Excelente ritmo. Tu ahorro está por encima del 20% recomendado.' : 'Cada pequeño aporte suma. Probá acercarte gradualmente al 20%.'}</p></Card>
      <Card className="chart-card"><SectionHeader title="Gastos por categoría" /><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={categories} dataKey="value" innerRadius={55} outerRadius={86} stroke="none" paddingAngle={2}>{categories.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer><div className="compact-legend">{categories.slice(0, 4).map((item) => <span key={item.id}><i style={{ background: item.color }} />{item.name}</span>)}</div></Card>
      <Card className="chart-card"><SectionHeader title="Fijos vs. variables" /><ResponsiveContainer width="100%" height={250}><BarChart data={[{ name: 'Fijos', value: summary.fixedExpenses, fill: '#9b87d3' }, { name: 'Variables', value: summary.variableExpenses, fill: '#f19a8e' }]} margin={{ top: 20, right: 10, left: -10 }}><CartesianGrid strokeDasharray="3 3" stroke="#ebe7f1" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="value" radius={[10, 10, 0, 0]}>{[ '#9b87d3', '#f19a8e' ].map((fill) => <Cell key={fill} fill={fill} />)}</Bar></BarChart></ResponsiveContainer></Card>
      <Card className="chart-card chart-card--wide"><SectionHeader title="Comparación con el mes anterior" /><ResponsiveContainer width="100%" height={260}><BarChart data={comparison} margin={{ top: 20, right: 10, left: -5 }}><CartesianGrid strokeDasharray="3 3" stroke="#ebe7f1" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="anterior" name="Mes anterior" fill="#ddd6eb" radius={[7, 7, 0, 0]} /><Bar dataKey="actual" name="Mes actual" fill="#8f7dcc" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></Card>
    </div>
  </>;
}
