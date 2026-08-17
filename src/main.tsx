import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './app/providers/AuthProvider';
import { App } from './app/App';
import './shared/styles/global.css';

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><AuthProvider><App /></AuthProvider></HashRouter></StrictMode>);
