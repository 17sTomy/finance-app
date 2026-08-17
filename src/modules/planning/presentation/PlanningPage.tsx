import { Flag, Gauge, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { goalSavedAmount, goalTargetAmount, limitProgress, monthlySalary } from '../../finance/domain/financeSelectors';
import type { Category, CategoryKind, Currency, MonthlyLimit, SavingsGoal } from '../../finance/domain/models';
import { newId } from '../../finance/domain/models';
import { Card } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { ConfirmDialog, Modal } from '../../../shared/components/Modal';

type Tab = 'limits' | 'goals' | 'categories';
type GoalTargetMode = 'amount' | 'salaryPercentage';

function LimitForm({ initial, onDone }: { initial?: MonthlyLimit; onDone: () => void }) {
  const { database, monthData, saveLimit } = useFinance();
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? database.categories.find((item) => item.kind === 'expense')?.id ?? 'other');
  const [percentage, setPercentage] = useState(initial ? String(limitProgress(initial, monthData).configuredPercentage) : '10');
  const [error, setError] = useState('');
  const salary = monthlySalary(monthData);
  const calculatedAmount = salary * (Number(percentage) || 0) / 100;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(percentage);
    if (!Number.isFinite(value) || value <= 0 || value > 100) return setError('Ingresá un porcentaje entre 0 y 100.');
    saveLimit({ id: initial?.id ?? newId(), categoryId, percentage: value, currency: 'ARS' });
    onDone();
  };
  return <form className="form-grid" onSubmit={submit}>
    <label className="field--wide">Categoría<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{database.categories.filter((item) => item.kind === 'expense').map((item) => <option disabled={!initial && monthData.limits.some((limit) => limit.categoryId === item.id)} key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    <label>Porcentaje del sueldo<input autoFocus type="number" min="0.1" max="100" step="0.1" value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label>
    <div className="calculated-value"><small>Límite mensual resultante</small><MoneyValue value={calculatedAmount} /></div>
    <p className="form-note field--wide">Se recalcula automáticamente si cambia tu sueldo recurrente.</p>
    {error && <p className="form-error field--wide">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar límite</button></div>
  </form>;
}

function GoalForm({ initial, onDone }: { initial?: SavingsGoal; onDone: () => void }) {
  const { monthData, saveGoal } = useFinance();
  const initialMode = initial?.targetMode ?? 'amount';
  const [name, setName] = useState(initial?.name ?? '');
  const [targetMode, setTargetMode] = useState<GoalTargetMode>(initialMode);
  const [value, setValue] = useState(initialMode === 'salaryPercentage' ? String(initial?.salaryPercentage ?? '') : initial?.targetAmount ? String(initial.targetAmount) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'ARS');
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');
  const [color, setColor] = useState(initial?.color ?? '#9b87d3');
  const [error, setError] = useState('');
  const numericValue = Number(value);
  const calculatedAmount = targetMode === 'salaryPercentage' ? monthlySalary(monthData) * (numericValue || 0) / 100 : numericValue || 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Ingresá un nombre.');
    if (!Number.isFinite(numericValue) || numericValue <= 0 || (targetMode === 'salaryPercentage' && numericValue > 100)) return setError(targetMode === 'salaryPercentage' ? 'Ingresá un porcentaje entre 0 y 100.' : 'Ingresá un monto objetivo válido.');
    saveGoal({ id: initial?.id ?? newId(), name: name.trim(), targetAmount: targetMode === 'amount' ? numericValue : 0, targetMode, salaryPercentage: targetMode === 'salaryPercentage' ? numericValue : undefined, currency: targetMode === 'salaryPercentage' ? 'ARS' : currency, targetDate: targetDate || undefined, color, contributions: initial?.contributions ?? [] });
    onDone();
  };
  return <form className="form-grid" onSubmit={submit}>
    <label className="field--wide">Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Mi casa" /></label>
    <label className="field--wide">Configurar objetivo como<select value={targetMode} onChange={(event) => { setTargetMode(event.target.value as GoalTargetMode); setValue(''); }}><option value="amount">Valor total</option><option value="salaryPercentage">Porcentaje del sueldo</option></select></label>
    <label>{targetMode === 'amount' ? 'Monto objetivo' : 'Porcentaje del sueldo'}<input type="number" min="0.1" max={targetMode === 'salaryPercentage' ? 100 : undefined} step={targetMode === 'salaryPercentage' ? '0.1' : '1'} value={value} onChange={(event) => setValue(event.target.value)} /></label>
    {targetMode === 'amount' ? <label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option value="ARS">ARS</option><option value="USD">USD</option></select></label> : <div className="calculated-value"><small>Objetivo mensual resultante</small><MoneyValue value={calculatedAmount} /></div>}
    <label>Fecha objetivo (opcional)<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
    <label>Color<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
    {error && <p className="form-error field--wide">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar objetivo</button></div>
  </form>;
}

function CategoryForm({ initial, onDone }: { initial?: Category; onDone: () => void }) {
  const { saveCategory } = useFinance();
  const [name, setName] = useState(initial?.name ?? ''); const [icon, setIcon] = useState(initial?.icon ?? '✨'); const [color, setColor] = useState(initial?.color ?? '#9b87d3'); const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? 'expense'); const [error, setError] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return setError('Ingresá un nombre.'); saveCategory({ id: initial?.id ?? newId(), name: name.trim(), icon: icon.trim() || '•', color, kind }); onDone(); };
  return <form className="form-grid" onSubmit={submit}><label className="field--wide">Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Mascotas" /></label><label>Ícono<input value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={4} /></label><label>Color<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label className="field--wide">Usar para<select value={kind} onChange={(event) => setKind(event.target.value as CategoryKind)}><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="saving">Ahorro en dólares</option><option value="investment">Inversiones</option><option value="all">Cualquier movimiento</option></select></label>{error && <p className="form-error field--wide">{error}</p>}<div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar categoría</button></div></form>;
}

export function PlanningPage() {
  const { database, monthData, selectedMonth, deleteLimit, deleteGoal, deleteCategory, contributeToGoal } = useFinance();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTabState] = useState<Tab>(requestedTab === 'goals' || requestedTab === 'categories' ? requestedTab : 'limits');
  const [editingLimit, setEditingLimit] = useState<MonthlyLimit | null | undefined>(); const [editingGoal, setEditingGoal] = useState<SavingsGoal | null | undefined>(); const [editingCategory, setEditingCategory] = useState<Category | null | undefined>(); const [deleteTarget, setDeleteTarget] = useState<{ type: Tab; id: string } | null>(null); const [contributing, setContributing] = useState<SavingsGoal | null>(null); const [contribution, setContribution] = useState(''); const [contributionError, setContributionError] = useState('');
  const tabs = [{ id: 'limits' as const, label: 'Límites', icon: Gauge }, { id: 'goals' as const, label: 'Objetivos', icon: Flag }, { id: 'categories' as const, label: 'Categorías', icon: Tags }];
  const setTab = (next: Tab) => { setTabState(next); setSearchParams({ tab: next }, { replace: true }); };
  const add = () => tab === 'limits' ? setEditingLimit(null) : tab === 'goals' ? setEditingGoal(null) : setEditingCategory(null);
  const confirmDelete = () => { if (!deleteTarget) return; if (deleteTarget.type === 'limits') deleteLimit(deleteTarget.id); else if (deleteTarget.type === 'goals') deleteGoal(deleteTarget.id); else deleteCategory(deleteTarget.id); };
  return <>
    <div className="page-heading"><div><p className="eyebrow">HÁBITOS Y METAS</p><h1>Planificación</h1><p>Definí límites, objetivos y categorías a tu manera.</p></div><button className="button button--primary" onClick={add}><Plus size={18} /> Agregar {tab === 'limits' ? 'límite' : tab === 'goals' ? 'objetivo' : 'categoría'}</button></div>
    <div className="filter-tabs planning-tabs">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}</div>
    {tab === 'limits' && <div className="planning-grid">{monthData.limits.map((limit) => { const category = database.categories.find((item) => item.id === limit.categoryId); const progress = limitProgress(limit, monthData); return <Card key={limit.id} className="planning-card"><div className="planning-card__header"><span className="category-icon" style={{ background: `${category?.color}22` }}>{category?.icon}</span><div className="row-actions"><button className="icon-button" aria-label={`Editar límite ${category?.name}`} onClick={() => setEditingLimit(limit)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar límite ${category?.name}`} onClick={() => setDeleteTarget({ type: 'limits', id: limit.id })}><Trash2 size={17} /></button></div></div><h2>{category?.name}</h2><div className="limit-values"><MoneyValue value={progress.spent} /><span>de <MoneyValue value={progress.limitAmount} /> ({progress.configuredPercentage.toFixed(1)}%)</span></div><ProgressBar value={progress.percentage} color={category?.color} /><small>{Math.round(progress.percentage)}% usado · {progress.percentage > 100 ? 'límite superado suavemente' : progress.percentage >= 80 ? 'cerca del límite' : 'vas muy bien'}</small></Card>; })}</div>}
    {tab === 'goals' && <div className="planning-grid">{database.goals.map((goal) => { const total = goalSavedAmount(goal, selectedMonth); const target = goalTargetAmount(goal, monthData); const progress = target > 0 ? total / target * 100 : 0; return <Card key={goal.id} className="planning-card goal-card"><div className="planning-card__header"><span className="category-icon" style={{ background: `${goal.color}22`, color: goal.color }}><Flag size={20} /></span><div className="row-actions"><button className="icon-button" aria-label={`Editar ${goal.name}`} onClick={() => setEditingGoal(goal)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar ${goal.name}`} onClick={() => setDeleteTarget({ type: 'goals', id: goal.id })}><Trash2 size={17} /></button></div></div><h2>{goal.name}</h2><div className="limit-values"><MoneyValue value={total} currency={goal.currency} /><span>de <MoneyValue value={target} currency={goal.currency} />{goal.targetMode === 'salaryPercentage' ? ` (${goal.salaryPercentage}%)` : ''}</span></div><ProgressBar value={progress} color={goal.color} /><div className="goal-footer"><small>{Math.round(progress)}% completado{goal.targetDate ? ` · meta ${new Intl.DateTimeFormat('es-AR').format(new Date(`${goal.targetDate}T12:00:00`))}` : ''}</small><button className="text-button" onClick={() => { setContributing(goal); setContribution(''); setContributionError(''); }}>+ Aportar</button></div></Card>; })}</div>}
    {tab === 'categories' && <Card className="categories-list">{database.categories.map((category) => <div key={category.id} className="category-row"><span className="category-icon" style={{ background: `${category.color}22` }}>{category.icon}</span><div><strong>{category.name}</strong><small>{category.kind === 'all' ? 'Todos los movimientos' : category.kind === 'expense' ? 'Gastos' : category.kind === 'income' ? 'Ingresos' : category.kind === 'saving' ? 'Ahorro en dólares' : 'Inversiones'}</small></div><span className="color-swatch" style={{ background: category.color }} /><div className="row-actions"><button className="icon-button" aria-label={`Editar ${category.name}`} onClick={() => setEditingCategory(category)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar ${category.name}`} onClick={() => setDeleteTarget({ type: 'categories', id: category.id })}><Trash2 size={17} /></button></div></div>)}</Card>}
    <Modal open={editingLimit !== undefined} title={editingLimit ? 'Editar límite' : 'Nuevo límite'} onClose={() => setEditingLimit(undefined)}><LimitForm initial={editingLimit ?? undefined} onDone={() => setEditingLimit(undefined)} /></Modal>
    <Modal open={editingGoal !== undefined} title={editingGoal ? 'Editar objetivo' : 'Nuevo objetivo'} onClose={() => setEditingGoal(undefined)}><GoalForm initial={editingGoal ?? undefined} onDone={() => setEditingGoal(undefined)} /></Modal>
    <Modal open={editingCategory !== undefined} title={editingCategory ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setEditingCategory(undefined)}><CategoryForm initial={editingCategory ?? undefined} onDone={() => setEditingCategory(undefined)} /></Modal>
    <Modal open={!!contributing} title={`Aportar a ${contributing?.name ?? ''}`} onClose={() => setContributing(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const value = Number(contribution); if (!Number.isFinite(value) || value <= 0) return setContributionError('Ingresá un aporte mayor a cero.'); if (contributing) contributeToGoal(contributing.id, value); setContributing(null); }}><label className="field--wide">Importe<input autoFocus type="number" min="1" value={contribution} onChange={(event) => setContribution(event.target.value)} /></label><p className="form-note field--wide">El aporte también se registrará como movimiento y se descontará del balance disponible.</p>{contributionError && <p className="form-error field--wide">{contributionError}</p>}<div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={() => setContributing(null)}>Cancelar</button><button className="button button--primary">Registrar aporte</button></div></form></Modal>
    <ConfirmDialog open={!!deleteTarget} message={deleteTarget?.type === 'categories' ? 'Los movimientos existentes conservarán su referencia histórica.' : 'Esta acción no se puede deshacer.'} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
  </>;
}
