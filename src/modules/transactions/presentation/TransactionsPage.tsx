import { ArrowDown, ArrowUp, CircleDollarSign, MoreHorizontal, Pencil, PiggyBank, Plus, Search, Trash2, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFinance } from '../../../app/providers/FinanceProvider';
import type { Transaction, TransactionType } from '../../finance/domain/models';
import { Card } from '../../../shared/components/Card';
import { MoneyValue } from '../../../shared/components/MoneyValue';
import { ConfirmDialog, Modal } from '../../../shared/components/Modal';
import { EmptyState } from '../../../shared/components/EmptyState';
import { formatShortDate } from '../../../shared/utils/format';
import { categoryFamilyIds, categoryLabel, categoryTree } from '../../finance/domain/categories';
import { TransactionForm } from './TransactionForm';

type Filter = 'all' | TransactionType;
const filters: { value: Filter; label: string }[] = [{ value: 'all', label: 'Todos' }, { value: 'income', label: 'Ingresos' }, { value: 'expense', label: 'Gastos' }, { value: 'saving', label: 'Ahorro USD' }, { value: 'investment', label: 'Inversiones' }];

const iconByType = { income: ArrowUp, expense: ArrowDown, saving: PiggyBank, investment: TrendingUp };
const isIncoming = (item: Transaction) => item.type === 'income' || ((item.type === 'saving' || item.type === 'investment') && item.assetAction === 'sell');
const typeLabel = (item: Transaction) => item.type === 'income' ? 'Ingreso' : item.type === 'expense' ? item.expenseType === 'fixed' ? 'Fijo' : 'Gasto' : item.type === 'saving' ? item.assetAction === 'sell' ? 'Venta USD' : 'Compra USD' : item.assetAction === 'sell' ? 'Venta CEDEAR' : 'Compra CEDEAR';
const displayedMovement = (item: Transaction) => item.type === 'saving' && item.exchangeRate
  ? { value: (item.assetAction === 'sell' ? 1 : -1) * item.amount * item.exchangeRate, currency: 'ARS' as const }
  : { value: isIncoming(item) ? item.amount : -item.amount, currency: item.currency };

export function TransactionsPage() {
  const { monthData, database, deleteTransaction } = useFinance();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [ascending, setAscending] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const selectedCategoryIds = category === 'all' ? null : categoryFamilyIds(category, database.categories);
  const items = useMemo(() => monthData.transactions
    .filter((item) => filter === 'all' || item.type === filter)
    .filter((item) => !selectedCategoryIds || !!item.categoryId && selectedCategoryIds.has(item.categoryId))
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)), [monthData.transactions, filter, selectedCategoryIds, search, ascending]);

  return <>
    <div className="page-heading"><div><p className="eyebrow">REGISTRO MENSUAL</p><h1>Movimientos</h1><p>Todo lo que pasó con tu plata, en un solo lugar.</p></div><button className="button button--primary" onClick={() => setCreating(true)}><Plus size={18} /> Nuevo movimiento</button></div>
    <div className="filter-tabs" role="tablist">{filters.map((item) => <button key={item.value} role="tab" aria-selected={filter === item.value} className={filter === item.value ? 'active' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
    <Card className="transactions-card">
      <div className="toolbar"><label className="search-box"><Search size={18} /><input aria-label="Buscar por nombre" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar movimiento..." /></label><select aria-label="Filtrar por categoría" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas las categorías</option>{categoryTree(database.categories).map((item) => <option key={item.id} value={item.id}>{categoryLabel(item, database.categories)}</option>)}</select><button className="button button--ghost" onClick={() => setAscending((value) => !value)}>Fecha {ascending ? '↑' : '↓'}</button></div>
      {items.length === 0 ? <EmptyState title="No encontramos movimientos" description="Probá cambiando los filtros o agregá el primero." action={<button className="button button--primary" onClick={() => setCreating(true)}>Agregar movimiento</button>} /> : <div className="transaction-list">{items.map((item) => {
        const categoryItem = database.categories.find((entry) => entry.id === item.categoryId);
        const Icon = iconByType[item.type];
        return <article className="transaction-row" key={item.id}>
          <span className={`transaction-icon transaction-icon--${item.type}`}><Icon size={18} /></span>
          <div className="transaction-name"><strong>{item.name}{item.installmentNumber && <span className="installment-label">Cuota {item.installmentNumber}/{item.installmentCount}</span>}</strong><small>{categoryItem ? categoryLabel(categoryItem, database.categories) : 'Sin categoría'} · {formatShortDate(item.date)}{item.investmentTicker ? ` · ${item.investmentQuantity} ${item.investmentTicker}` : ''}{item.exchangeRate ? ` · USD ${item.amount.toLocaleString('es-AR')} · TC AR$ ${item.exchangeRate.toLocaleString('es-AR')}` : ''}</small></div>
          <span className={`type-badge type-badge--${item.type}`}>{typeLabel(item)}</span>
          <MoneyValue value={displayedMovement(item).value} currency={displayedMovement(item).currency} signed className={`transaction-amount transaction-amount--${item.type}`} />
          <div className="row-actions"><button className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => setEditing(item)}><Pencil size={17} /></button><button className="icon-button" aria-label={`Eliminar ${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={17} /></button></div>
          <button className="icon-button mobile-row-menu" aria-label={`Acciones para ${item.name}`} onClick={() => setEditing(item)}><MoreHorizontal size={19} /></button>
        </article>;
      })}</div>}
      <footer className="list-footer"><CircleDollarSign size={17} /><span>{items.length} movimientos en este mes</span></footer>
    </Card>
    <Modal open={creating} title="Nuevo movimiento" onClose={() => setCreating(false)}><TransactionForm onDone={() => setCreating(false)} /></Modal>
    <Modal open={!!editing} title="Editar movimiento" onClose={() => setEditing(null)}>{editing && <TransactionForm initial={editing} onDone={() => setEditing(null)} />}</Modal>
    <ConfirmDialog open={!!deleting} message={deleting?.installmentPlanId ? 'Se eliminará el plan de cuotas completo, incluyendo todas las cuotas futuras.' : 'Esta acción elimina el movimiento del mes seleccionado.'} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteTransaction(deleting.id)} />
  </>;
}
