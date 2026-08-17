import { Landmark } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider';

export function AuthPage() {
  const { user, signIn, signUp, configurationError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || password.length < 6) return setMessage({ type: 'error', text: 'Ingresá un email válido y una contraseña de al menos 6 caracteres.' });
    setBusy(true); setMessage(null);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
        const from = (location.state as { from?: string } | null)?.from ?? '/';
        navigate(from, { replace: true });
      } else {
        const needsConfirmation = await signUp(email.trim(), password);
        if (needsConfirmation) setMessage({ type: 'success', text: 'Cuenta creada. Revisá tu email para confirmarla antes de ingresar.' });
        else navigate('/', { replace: true });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No pudimos completar la autenticación.' });
    } finally { setBusy(false); }
  };

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span className="brand__mark"><Landmark size={24} /></span><div><strong>Titu's</strong><small>Finance</small></div></div>
    <div><p className="eyebrow">TUS FINANZAS, SEGURAS</p><h1>{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</h1><p className="muted">Tus datos se guardan en Supabase y solamente tu usuario puede accederlos.</p></div>
    {configurationError && <div className="auth-message auth-message--error"><strong>Supabase no está configurado</strong><span>{configurationError} Copiá `.env.example` como `.env.local` y completá ambas variables.</span></div>}
    {message && <div className={`auth-message auth-message--${message.type}`}>{message.text}</div>}
    <form onSubmit={submit} className="auth-form">
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vos@ejemplo.com" autoFocus /></label>
      <label>Contraseña<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="button button--primary button--full" disabled={busy || !!configurationError}>{busy ? 'Procesando…' : mode === 'login' ? 'Ingresar' : 'Registrarme'}</button>
    </form>
    <button className="text-button auth-switch" onClick={() => { setMode((current) => current === 'login' ? 'register' : 'login'); setMessage(null); }}>{mode === 'login' ? '¿No tenés cuenta? Registrate' : 'Ya tengo cuenta'}</button>
  </section></main>;
}
