import { Bell, CalendarDays, ChartNoAxesCombined, Eye, EyeOff, House, Landmark, Menu, ReceiptText, Settings, Target, WalletCards, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useFinance } from '../providers/FinanceProvider';
import { MonthSelector } from '../../shared/components/MonthSelector';
import { ReminderCenter } from '../../modules/calendar/presentation/ReminderCenter';

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
  const { showAmounts, toggleAmounts } = useFinance();
  const [menuOpen, setMenuOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
      <div className="brand"><span className="brand__mark"><Landmark size={22} /></span><div><strong>Titu's</strong><small>Finance</small></div></div>
      <button className="icon-button sidebar__close" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X /></button>
      <nav>{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar__footer"><div className="avatar">TM</div><div><strong>Mis finanzas</strong><small>Datos locales</small></div></div>
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
      <div className="page"><Outlet /></div>
    </main>
    <nav className="bottom-nav">{navigation.slice(0, 5).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20} /><span>{label === 'Planificación' ? 'Plan' : label}</span></NavLink>)}</nav>
  </div>;
}
