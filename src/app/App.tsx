import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';

const DashboardPage = lazy(() => import('../modules/dashboard/presentation/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const TransactionsPage = lazy(() => import('../modules/transactions/presentation/TransactionsPage').then((module) => ({ default: module.TransactionsPage })));
const FixedExpensesPage = lazy(() => import('../modules/expenses/presentation/FixedExpensesPage').then((module) => ({ default: module.FixedExpensesPage })));
const PlanningPage = lazy(() => import('../modules/planning/presentation/PlanningPage').then((module) => ({ default: module.PlanningPage })));
const CalendarPage = lazy(() => import('../modules/calendar/presentation/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const AnalysisPage = lazy(() => import('../modules/analysis/presentation/AnalysisPage').then((module) => ({ default: module.AnalysisPage })));
const DataPage = lazy(() => import('../modules/settings/presentation/DataPage').then((module) => ({ default: module.DataPage })));

export function App() {
  return <Suspense fallback={<div className="route-loading">Preparando tus finanzas…</div>}><Routes><Route element={<AppLayout />}><Route index element={<DashboardPage />} /><Route path="movimientos" element={<TransactionsPage />} /><Route path="fijos" element={<FixedExpensesPage />} /><Route path="planificacion" element={<PlanningPage />} /><Route path="calendario" element={<CalendarPage />} /><Route path="analisis" element={<AnalysisPage />} /><Route path="datos" element={<DataPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes></Suspense>;
}
