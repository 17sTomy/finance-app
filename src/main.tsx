import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { FinanceProvider } from './app/providers/FinanceProvider';
import { App } from './app/App';
import './shared/styles/global.css';

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><FinanceProvider><App /></FinanceProvider></HashRouter></StrictMode>);
