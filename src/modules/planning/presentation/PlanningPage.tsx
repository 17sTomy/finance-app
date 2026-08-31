import { ChevronDown, Flag, Gauge, Pencil, Plus, RotateCw, Tags, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFinance } from '../../../app/providers/FinanceProvider';
import { categoryChildren, categoryLabel } from '../../finance/domain/categories';
import { goalSavedAmount, goalTargetAmount, limitCategoryBreakdown, limitProgress, monthlySalary } from '../../finance/domain/financeSelectors';
import type { Category, CategoryKind, Currency, MonthlyLimit, SavingsGoal } from '../../finance/domain/models';
import { newId } from '../../finance/domain/models';
import { Card } from '../../../shared/components/Card';
import { EmptyState } from '../../../shared/components/EmptyState';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { ConfirmDialog, Modal } from '../../../shared/components/Modal';

type Tab = 'limits' | 'goals' | 'categories';
type GoalTargetMode = 'amount' | 'salaryPercentage';

const categoryKindLabel = (kind: CategoryKind) => kind === 'all' ? 'Todos los movimientos' : kind === 'expense' ? 'Gastos' : kind === 'income' ? 'Ingresos' : kind === 'saving' ? 'Ahorro en dólares' : 'Inversiones';

const limitUsageStatus = (percentage: number) => {
  if (percentage >= 250) return { label: 'exceso crítico', tone: 'critical' };
  if (percentage >= 150) return { label: 'límite muy superado', tone: 'critical' };
  if (percentage > 100) return { label: 'límite superado', tone: 'over' };
  if (percentage === 100) return { label: 'límite alcanzado', tone: 'near' };
  if (percentage >= 80) return { label: 'cerca del límite', tone: 'near' };
  return { label: 'vas muy bien', tone: 'ok' };
};

function LimitForm({ initial, onDone }: { initial?: MonthlyLimit; onDone: () => void }) {
  const { database, monthData, saveLimit } = useFinance();
  const categories = database.categories.filter((item) => !item.parentId && (item.kind === 'expense' || item.kind === 'all'));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories.find((item) => !monthData.limits.some((limit) => limit.categoryId === item.id))?.id ?? '');
  const [percentage, setPercentage] = useState(initial ? String(limitProgress(initial, monthData, database.categories).configuredPercentage) : '10');
  const [error, setError] = useState('');
  const calculatedAmount = monthlySalary(monthData) * (Number(percentage) || 0) / 100;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(percentage);
    if (!categoryId) return setError('Elegí una categoría principal.');
    if (!Number.isFinite(value) || value <= 0 || value > 100) return setError('Ingresá un porcentaje entre 0 y 100.');
    saveLimit({ id: initial?.id ?? newId(), categoryId, percentage: value, currency: 'ARS' });
    onDone();
  };
  return <form className="form-grid" onSubmit={submit}>
    <label className="field--wide">Categoría principal<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((item) => <option disabled={!initial && monthData.limits.some((limit) => limit.categoryId === item.id)} key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    <label>Porcentaje del sueldo<input autoFocus type="number" min="0.1" max="100" step="0.1" value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label>
    <div className="calculated-value"><small>Límite mensual resultante</small><MoneyValue value={calculatedAmount} /></div>
    <p className="form-note field--wide">Incluye automáticamente los gastos de todas sus subcategorías y se recalcula si cambia tu sueldo recurrente.</p>
    {error && <p className="form-error field--wide" role="alert">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar límite</button></div>
  </form>;
}

function GoalForm({ initial, onDone }: { initial?: SavingsGoal; onDone: () => void }) {
  const { database, monthData, saveGoal } = useFinance();
  const categories = database.categories.filter((item) => !item.parentId && item.kind !== 'income');
  const initialMode = initial?.targetMode ?? 'amount';
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '');
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
    if (!categoryId) return setError('Elegí una categoría para el objetivo.');
    if (!Number.isFinite(numericValue) || numericValue <= 0 || (targetMode === 'salaryPercentage' && numericValue > 100)) return setError(targetMode === 'salaryPercentage' ? 'Ingresá un porcentaje entre 0 y 100.' : 'Ingresá un monto objetivo válido.');
    saveGoal({ id: initial?.id ?? newId(), name: name.trim(), categoryId, targetAmount: targetMode === 'amount' ? numericValue : 0, targetMode, salaryPercentage: targetMode === 'salaryPercentage' ? numericValue : undefined, currency: targetMode === 'salaryPercentage' ? 'ARS' : currency, targetDate: targetDate || undefined, color, contributions: initial?.contributions ?? [] });
    onDone();
  };
  return <form className="form-grid" onSubmit={submit}>
    <label className="field--wide">Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Mi casa" /></label>
    <label className="field--wide">Categoría<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    <label className="field--wide">Configurar objetivo como<select value={targetMode} onChange={(event) => { setTargetMode(event.target.value as GoalTargetMode); setValue(''); }}><option value="amount">Valor total</option><option value="salaryPercentage">Porcentaje del sueldo</option></select></label>
    <label>{targetMode === 'amount' ? 'Monto objetivo' : 'Porcentaje del sueldo'}<input type="number" min="0.1" max={targetMode === 'salaryPercentage' ? 100 : undefined} step={targetMode === 'salaryPercentage' ? '0.1' : '1'} value={value} onChange={(event) => setValue(event.target.value)} /></label>
    {targetMode === 'amount' ? <label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option value="ARS">ARS</option><option value="USD">USD</option></select></label> : <div className="calculated-value"><small>Objetivo mensual resultante</small><MoneyValue value={calculatedAmount} /></div>}
    <label>Fecha objetivo (opcional)<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
    <label>Color<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
    {error && <p className="form-error field--wide" role="alert">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar objetivo</button></div>
  </form>;
}

function CategoryForm({ initial, onDone }: { initial?: Category; onDone: () => void }) {
  const { database, saveCategory } = useFinance();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '✨');
  const [color, setColor] = useState(initial?.color ?? '#9b87d3');
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? 'expense');
  const [parentId, setParentId] = useState(initial?.parentId ?? '');
  const [error, setError] = useState('');
  const hasChildren = !!initial && database.categories.some((item) => item.parentId === initial.id);
  const hasPlanningAssociation = !!initial && (database.goals.some((item) => item.categoryId === initial.id) || Object.values(database.months).some((month) => month.limits.some((item) => item.categoryId === initial.id)));
  const mustStayRoot = hasChildren || hasPlanningAssociation;
  const parents = database.categories.filter((item) => !item.parentId && item.id !== initial?.id && item.kind === kind);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Ingresá un nombre.');
    saveCategory({ id: initial?.id ?? newId(), name: name.trim(), icon: icon.trim() || '•', color, kind, parentId: parentId || undefined });
    onDone();
  };
  return <form className="form-grid" onSubmit={submit}>
    <label className="field--wide">Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Gimnasio" /></label>
    <label>Ícono<input value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={4} /></label>
    <label>Color<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
    <label className="field--wide">Usar para<select value={kind} onChange={(event) => { setKind(event.target.value as CategoryKind); setParentId(''); }}><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="saving">Ahorro en dólares</option><option value="investment">Inversiones</option><option value="all">Cualquier movimiento</option></select></label>
    <label className="field--wide">Categoría principal (opcional)<select value={parentId} disabled={mustStayRoot} onChange={(event) => setParentId(event.target.value)}><option value="">Ninguna — es una categoría principal</option>{parents.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
    {hasChildren && <p className="form-note field--wide">Esta categoría ya tiene subcategorías, por eso debe seguir siendo principal.</p>}
    {!hasChildren && hasPlanningAssociation && <p className="form-note field--wide">Esta categoría tiene un límite u objetivo asociado, por eso debe seguir siendo principal.</p>}
    <p className="form-note field--wide">Las subcategorías permiten detallar consumos. El límite se configura en la categoría principal y suma todos esos consumos.</p>
    {error && <p className="form-error field--wide" role="alert">{error}</p>}
    <div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={onDone}>Cancelar</button><button className="button button--primary">Guardar categoría</button></div>
  </form>;
}

export function PlanningPage() {
  const { database, monthData, selectedMonth, deleteLimit, deleteGoal, deleteCategory, contributeToGoal } = useFinance();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTabState] = useState<Tab>(requestedTab === 'goals' || requestedTab === 'categories' ? requestedTab : 'limits');
  const [editingLimit, setEditingLimit] = useState<MonthlyLimit | null | undefined>();
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null | undefined>();
  const [editingCategory, setEditingCategory] = useState<Category | null | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ type: Tab; id: string } | null>(null);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const [contribution, setContribution] = useState('');
  const [contributionError, setContributionError] = useState('');
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const tabs = [{ id: 'limits' as const, label: 'Límites', icon: Gauge }, { id: 'goals' as const, label: 'Objetivos', icon: Flag }, { id: 'categories' as const, label: 'Categorías', icon: Tags }];
  const rootCategories = database.categories.filter((item) => !item.parentId || !database.categories.some((parent) => parent.id === item.parentId));
  const hasLimitCategories = database.categories.some((item) => !item.parentId && (item.kind === 'expense' || item.kind === 'all'));
  const hasGoalCategories = database.categories.some((item) => !item.parentId && item.kind !== 'income');
  const setTab = (next: Tab) => { setTabState(next); setSearchParams({ tab: next }, { replace: true }); };
  const createCategory = () => { setTab('categories'); setEditingCategory(null); };
  const add = () => {
    if (tab === 'limits') return hasLimitCategories ? setEditingLimit(null) : createCategory();
    if (tab === 'goals') return hasGoalCategories ? setEditingGoal(null) : createCategory();
    setEditingCategory(null);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'limits') deleteLimit(deleteTarget.id);
    else if (deleteTarget.type === 'goals') deleteGoal(deleteTarget.id);
    else deleteCategory(deleteTarget.id);
  };
  return <>
    <div className="page-heading"><div><p className="eyebrow">HÁBITOS Y METAS</p><h1>Planificación</h1><p>Definí límites, objetivos y categorías a tu manera.</p></div><button className="button button--primary" onClick={add}><Plus size={18} /> Agregar {tab === 'limits' ? 'límite' : tab === 'goals' ? 'objetivo' : 'categoría'}</button></div>
    <div className="filter-tabs planning-tabs">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}</div>

    {tab === 'limits' && (monthData.limits.length === 0
      ? <Card><EmptyState title="No tenés límites creados" description={hasLimitCategories ? 'Creá un límite para decidir cuánto destinar a una categoría principal.' : 'Primero creá una categoría principal de gastos y después asignale un límite.'} action={<button className="button button--primary" onClick={hasLimitCategories ? () => setEditingLimit(null) : createCategory}>{hasLimitCategories ? 'Crear límite' : 'Crear categoría'}</button>} /></Card>
      : <div className="planning-grid">{monthData.limits.map((limit) => {
        const category = database.categories.find((item) => item.id === limit.categoryId);
        const progress = limitProgress(limit, monthData, database.categories);
        const breakdown = limitCategoryBreakdown(limit, monthData, database.categories);
        const visibleBreakdown = breakdown.filter(({ category: item, spent }) => !!item.parentId || spent > 0);
        const usageStatus = limitUsageStatus(progress.percentage);
        const usageCopy = `${Math.round(progress.percentage)}% usado · ${usageStatus.label}`;
        return <Card key={limit.id} className="planning-card limit-card" role="group" aria-label={`Límite de ${category?.name ?? 'categoría eliminada'}`} tabIndex={0}>
          <div className="limit-card__inner">
            <div className="limit-card__face limit-card__front">
              <div className="planning-card__header"><span className="category-icon" style={{ background: `${category?.color}22` }}>{category?.icon}</span><span className="limit-card__flip-hint" aria-hidden="true"><RotateCw size={14} /></span></div>
              <span className="category-breadcrumb">Categoría principal</span>
              <h2>{category?.name ?? 'Categoría eliminada'}</h2>
              <div className="limit-values"><MoneyValue value={progress.spent} /><span>de <MoneyValue value={progress.limitAmount} /> ({progress.configuredPercentage.toFixed(1)}%)</span></div>
              <ProgressBar value={progress.percentage} color={category?.color} />
              <small className={`limit-usage-status limit-usage-status--${usageStatus.tone}`}>{usageCopy}</small>
            </div>
            <div className="limit-card__face limit-card__back" aria-label={`Detalle de ${category?.name ?? 'categoría eliminada'}`}>
              <div className="planning-card__header">
                <div><span className="category-breadcrumb">Categoría principal</span><h2>Detalle de {category?.name ?? 'Categoría eliminada'}</h2></div>
                <div className="row-actions"><button className="icon-button" aria-label={`Editar límite ${category?.name}`} onClick={() => setEditingLimit(limit)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar límite ${category?.name}`} onClick={() => setDeleteTarget({ type: 'limits', id: limit.id })}><Trash2 size={17} /></button></div>
              </div>
              <div className="limit-card__back-summary"><div><small>Gastado</small><MoneyValue value={progress.spent} /></div><div><small>Límite</small><MoneyValue value={progress.limitAmount} /></div><div><small>Uso</small><strong>{Math.round(progress.percentage)}%</strong></div></div>
              <ProgressBar value={progress.percentage} color={category?.color} />
              <small className={`limit-usage-status limit-usage-status--${usageStatus.tone}`}>{usageCopy}</small>
              <div className="limit-card__breakdown"><strong>Distribución por subcategoría</strong>{visibleBreakdown.length > 0 ? visibleBreakdown.map(({ category: item, spent }) => <div key={item.id}><span>{item.parentId ? `${item.icon} ${item.name}` : 'Sin subcategoría'}</span><MoneyValue value={spent} currency={limit.currency} /></div>) : <p>Sin consumos para desglosar.</p>}</div>
            </div>
          </div>
        </Card>;
      })}</div>)}

    {tab === 'goals' && (database.goals.length === 0
      ? <Card><EmptyState title="No tenés objetivos creados" description={hasGoalCategories ? 'Creá un objetivo y asocialo a la categoría para la que querés ahorrar.' : 'Primero creá una categoría y después vinculale un objetivo.'} action={<button className="button button--primary" onClick={hasGoalCategories ? () => setEditingGoal(null) : createCategory}>{hasGoalCategories ? 'Crear objetivo' : 'Crear categoría'}</button>} /></Card>
      : <div className="planning-grid">{database.goals.map((goal) => { const total = goalSavedAmount(goal, selectedMonth); const target = goalTargetAmount(goal, monthData); const progress = target > 0 ? total / target * 100 : 0; const category = database.categories.find((item) => item.id === goal.categoryId); return <Card key={goal.id} className="planning-card goal-card"><div className="planning-card__header"><span className="category-icon" style={{ background: `${goal.color}22`, color: goal.color }}><Flag size={20} /></span><div className="row-actions"><button className="icon-button" aria-label={`Editar ${goal.name}`} onClick={() => setEditingGoal(goal)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar ${goal.name}`} onClick={() => setDeleteTarget({ type: 'goals', id: goal.id })}><Trash2 size={17} /></button></div></div><span className="category-breadcrumb">{category?.name ?? 'Sin categoría'}</span><h2>{goal.name}</h2><div className="limit-values"><MoneyValue value={total} currency={goal.currency} /><span>de <MoneyValue value={target} currency={goal.currency} />{goal.targetMode === 'salaryPercentage' ? ` (${goal.salaryPercentage}%)` : ''}</span></div><ProgressBar value={progress} color={goal.color} /><div className="goal-footer"><small>{Math.round(progress)}% {goal.targetMode === 'salaryPercentage' ? 'del mes' : 'acumulado'}{goal.targetDate ? ` · meta ${new Intl.DateTimeFormat('es-AR').format(new Date(`${goal.targetDate}T12:00:00`))}` : ''}</small><button className="text-button" onClick={() => { setContributing(goal); setContribution(''); setContributionError(''); }}>+ Aportar</button></div></Card>; })}</div>)}

    {tab === 'categories' && (database.categories.length === 0
      ? <Card><EmptyState title="No tenés categorías creadas" description="Creá una categoría principal y después agregá subcategorías para detallar en qué usás el dinero." action={<button className="button button--primary" onClick={() => setEditingCategory(null)}>Crear categoría</button>} /></Card>
      : <Card className="categories-list">{rootCategories.map((category) => {
        const children = categoryChildren(category.id, database.categories);
        const expanded = expandedCategoryId === category.id;
        return <section className="category-group" key={category.id}>
          <div className="category-row category-row--parent">
            {children.length > 0 ? <button type="button" className="category-accordion__toggle" aria-expanded={expanded} aria-controls={`category-children-${category.id}`} aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} subcategorías de ${category.name}`} onClick={() => setExpandedCategoryId(expanded ? null : category.id)}><ChevronDown size={18} /></button> : <span className="category-accordion__spacer" />}
            <span className="category-icon" style={{ background: `${category.color}22` }}>{category.icon}</span>
            <div><strong>{category.name}</strong><small>Categoría principal · {categoryKindLabel(category.kind)}{children.length > 0 ? ` · ${children.length} subcategoría${children.length === 1 ? '' : 's'}` : ''}</small></div>
            <span className="color-swatch" style={{ background: category.color }} />
            <div className="row-actions"><button className="icon-button" aria-label={`Editar ${category.name}`} onClick={() => setEditingCategory(category)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar ${category.name}`} onClick={() => setDeleteTarget({ type: 'categories', id: category.id })}><Trash2 size={17} /></button></div>
          </div>
          {children.length > 0 && <div className="category-accordion__children" id={`category-children-${category.id}`} hidden={!expanded}>{children.map((child) => <div key={child.id} className="category-row category-row--child"><span className="category-icon" style={{ background: `${child.color}22` }}>{child.icon}</span><div><strong>{child.name}</strong><small>Subcategoría de {category.name} · {categoryKindLabel(child.kind)}</small></div><span className="color-swatch" style={{ background: child.color }} /><div className="row-actions"><button className="icon-button" aria-label={`Editar ${categoryLabel(child, database.categories)}`} onClick={() => setEditingCategory(child)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar ${categoryLabel(child, database.categories)}`} onClick={() => setDeleteTarget({ type: 'categories', id: child.id })}><Trash2 size={17} /></button></div></div>)}</div>}
        </section>;
      })}</Card>)}

    <Modal open={editingLimit !== undefined} title={editingLimit ? 'Editar límite' : 'Nuevo límite'} onClose={() => setEditingLimit(undefined)}><LimitForm initial={editingLimit ?? undefined} onDone={() => setEditingLimit(undefined)} /></Modal>
    <Modal open={editingGoal !== undefined} title={editingGoal ? 'Editar objetivo' : 'Nuevo objetivo'} onClose={() => setEditingGoal(undefined)}><GoalForm initial={editingGoal ?? undefined} onDone={() => setEditingGoal(undefined)} /></Modal>
    <Modal open={editingCategory !== undefined} title={editingCategory ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setEditingCategory(undefined)}><CategoryForm initial={editingCategory ?? undefined} onDone={() => setEditingCategory(undefined)} /></Modal>
    <Modal open={!!contributing} title={`Aportar a ${contributing?.name ?? ''}`} onClose={() => setContributing(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const value = Number(contribution); if (!Number.isFinite(value) || value <= 0) return setContributionError('Ingresá un aporte mayor a cero.'); if (contributing) contributeToGoal(contributing.id, value); setContributing(null); }}><label className="field--wide">Importe<input autoFocus type="number" min="1" value={contribution} onChange={(event) => setContribution(event.target.value)} /></label><p className="form-note field--wide">El aporte también se registrará como movimiento en la categoría del objetivo y se descontará del balance disponible.</p>{contributionError && <p className="form-error field--wide" role="alert">{contributionError}</p>}<div className="form-actions field--wide"><button type="button" className="button button--ghost" onClick={() => setContributing(null)}>Cancelar</button><button className="button button--primary">Registrar aporte</button></div></form></Modal>
    <ConfirmDialog open={!!deleteTarget} message={deleteTarget?.type === 'categories' ? 'Las subcategorías pasarán a ser principales. Las referencias directas a esta categoría quedarán sin asignar.' : 'Esta acción no se puede deshacer.'} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
  </>;
}
