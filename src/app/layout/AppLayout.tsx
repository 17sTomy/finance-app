import { Bell, CalendarDays, ChartNoAxesCombined, Eye, EyeOff, House, Landmark, LogOut, Menu, ReceiptText, Settings, Target, WalletCards, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useFinance } from '../providers/FinanceProvider';
import { MonthSelector } from '../../shared/components/MonthSelector';
import { ReminderCenter } from '../../modules/calendar/presentation/ReminderCenter';
import { useAuth } from '../providers/AuthProvider';

const navigation = [
  { to: '/', label: 'Inicio', icon: House },
  { to: '/movimientos', label: 'Movimientos', icon: ReceiptText },
  { to: '/fijos', label: 'Gastos fijos', icon: WalletCards },
  { to: '/planificacion', label: 'Planificación', icon: Target },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/analisis', label: 'Análisis', icon: ChartNoAxesCombined },
  { to: '/datos', label: 'Datos', icon: Settings },
];

export function AppLayout() {
  const { showAmounts, toggleAmounts, isLoading, loadError, saveError, retryLoad, retrySave } = useFinance();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
      <div className="brand"><span className="brand__mark"><Landmark size={22} /></span><div><strong>Titu's</strong><small>Finance</small></div></div>
      <button className="icon-button sidebar__close" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X /></button>
      <nav>{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar__footer"><div className="avatar">{user?.email?.slice(0, 2).toUpperCase() ?? 'TF'}</div><div><strong>Mis finanzas</strong><small>{user?.email}</small></div><button className="icon-button" aria-label="Cerrar sesión" onClick={() => void signOut()}><LogOut size={17} /></button></div>
    </aside>
    {menuOpen && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <main className="main-content">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}><Menu /></button>
        <MonthSelector />
        <div className="topbar__actions">
          <button className="icon-button" aria-label={showAmounts ? 'Ocultar importes' : 'Mostrar importes'} onClick={toggleAmounts}>{showAmounts ? <Eye size={20} /> : <EyeOff size={20} />}</button>
          <button className="icon-button notification-button" aria-label="Recordatorios" onClick={() => setRemindersOpen((value) => !value)}><Bell size={20} /><span /></button>
        </div>
        <ReminderCenter open={remindersOpen} onClose={() => setRemindersOpen(false)} />
      </header>
      <div className="page">
        {loadError && <div className="data-error" role="alert"><span>{loadError}</span><button className="text-button" onClick={retryLoad}>Reintentar carga</button></div>}
        {saveError && <div className="data-error" role="alert"><span>{saveError}</span><button className="text-button" onClick={retrySave}>Reintentar guardado</button></div>}
        {isLoading ? <div className="route-loading">Cargando tus finanzas…</div> : <Outlet />}
      </div>
    </main>
    <nav className="bottom-nav">{navigation.slice(0, 5).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20} /><span>{label === 'Planificación' ? 'Plan' : label}</span></NavLink>)}</nav>
  </div>;
}
