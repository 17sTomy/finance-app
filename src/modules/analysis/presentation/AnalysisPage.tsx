import { ArrowDownRight, ArrowUpRight, Landmark, PiggyBank, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { calculateSummary, dollarSavingsBalance, expensesByCategory } from '../../finance/domain/financeSelectors';
import { Card, SectionHeader } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { formatMoney } from '../../../shared/utils/format';

export function AnalysisPage() {
  const { database, monthData, selectedMonth } = useFinance();
  const summary = calculateSummary(monthData.transactions);
  const dollarBalance = dollarSavingsBalance(database, selectedMonth);
  const categories = expensesByCategory(monthData.transactions, database.categories);
  const previousDate = new Date(`${selectedMonth}-01T12:00:00`); previousDate.setMonth(previousDate.getMonth() - 1);
  const previousKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
  const previous = database.months[previousKey] ? calculateSummary(database.months[previousKey].transactions) : null;
  const comparison = [
    { label: 'Ingresos', actual: summary.income, anterior: previous?.income ?? 0 },
    { label: 'Gastos', actual: summary.expenses, anterior: previous?.expenses ?? 0 },
    { label: 'Inversiones', actual: summary.investments, anterior: previous?.investments ?? 0 },
  ];
  const goalContributionRate = summary.income > 0 ? summary.savings / summary.income * 100 : 0;
  const monthlyFlow = [
    { name: 'Ingresos', value: summary.income, fill: '#73b69b' },
    { name: 'Gastos', value: summary.expenses, fill: '#f19a8e' },
    { name: 'Inversiones', value: summary.investments, fill: '#8f7dcc' },
    { name: 'Balance', value: summary.balance, fill: summary.balance >= 0 ? '#6fa98f' : '#d98987' },
  ];
  return <>
    <div className="page-heading"><div><p className="eyebrow">LECTURA DEL MES</p><h1>Análisis mensual</h1><p>Señales claras para tomar mejores decisiones.</p></div></div>
    <div className="analysis-kpis"><Card><span className="soft-icon soft-icon--green"><ArrowUpRight size={18} /></span><small>Ingresos totales</small><MoneyValue value={summary.income} /></Card><Card><span className="soft-icon soft-icon--coral"><ArrowDownRight size={18} /></span><small>Gastos totales</small><MoneyValue value={summary.expenses} /></Card><Card><span className="soft-icon"><PiggyBank size={18} /></span><small>Tenencia USD</small><MoneyValue value={dollarBalance} currency="USD" /></Card><Card><span className="soft-icon soft-icon--blue"><Landmark size={18} /></span><small>Inversión neta del mes</small><MoneyValue value={summary.investments} /></Card><Card className="analysis-balance"><span className="soft-icon"><Wallet size={18} /></span><small>Balance</small><MoneyValue value={summary.balance} /></Card></div>
    <div className="analysis-grid">
      <Card className="chart-card chart-card--expenses"><SectionHeader title="Gastos por categoría" /><ResponsiveContainer width="100%" height={330}><PieChart><Pie data={categories} dataKey="value" innerRadius={72} outerRadius={118} stroke="none" paddingAngle={2}>{categories.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer><div className="compact-legend">{categories.slice(0, 6).map((item) => <span key={item.id}><i style={{ background: item.color }} />{item.name}</span>)}</div></Card>
      <Card className="savings-rate-card"><SectionHeader title="Aportes a objetivos" /><div className="rate-ring" style={{ '--rate': `${Math.min(goalContributionRate, 100) * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.round(goalContributionRate)}%</strong><small>del sueldo</small></div></div><p>Este indicador refleja los aportes registrados a objetivos durante el mes y su impacto real en el balance.</p></Card>
      <Card className="chart-card"><SectionHeader title="Composición de gastos" /><ResponsiveContainer width="100%" height={280}><BarChart data={[{ name: 'Fijos', value: summary.fixedExpenses, fill: '#9b87d3' }, { name: 'Variables', value: summary.variableExpenses, fill: '#f19a8e' }, { name: 'Activos', value: summary.assetPurchases, fill: '#718fc4' }]} margin={{ top: 20, right: 10, left: -10 }}><CartesianGrid strokeDasharray="3 3" stroke="#ebe7f1" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="value" radius={[10, 10, 0, 0]}>{['#9b87d3', '#f19a8e', '#718fc4'].map((fill) => <Cell key={fill} fill={fill} />)}</Bar></BarChart></ResponsiveContainer></Card>
      <Card className="chart-card"><SectionHeader title="Flujo del mes" /><p className="chart-subtitle">Ingresos, gastos, inversiones y saldo disponible.</p><ResponsiveContainer width="100%" height={260}><BarChart data={monthlyFlow} margin={{ top: 20, right: 10, left: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#ebe7f1" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="value" radius={[10, 10, 0, 0]}>{monthlyFlow.map((item) => <Cell key={item.name} fill={item.fill} />)}</Bar></BarChart></ResponsiveContainer></Card>
      <Card className="chart-card chart-card--wide"><SectionHeader title="Comparación con el mes anterior" /><ResponsiveContainer width="100%" height={300}><BarChart data={comparison} margin={{ top: 20, right: 10, left: -5 }}><CartesianGrid strokeDasharray="3 3" stroke="#ebe7f1" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="anterior" name="Mes anterior" fill="#ddd6eb" radius={[7, 7, 0, 0]} /><Bar dataKey="actual" name="Mes actual" fill="#8f7dcc" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></Card>
    </div>
  </>;
}
