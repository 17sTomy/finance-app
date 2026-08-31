import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  configurationError: string | null;
  nickname: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nickname: string) => Promise<boolean>;
  updateNickname: (nickname: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('No se pudo restaurar la sesión de Supabase.', error.message);
      setSession(data.session);
      setIsLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, nickname: string) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`, data: { nickname: nickname.trim() } },
    });
    if (error) throw new Error(error.message);
    return data.session === null;
  }, []);

  const updateNickname = useCallback(async (nickname: string) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const value = nickname.trim();
    if (!value) throw new Error('Ingresá un apodo.');
    const { data, error } = await supabase.auth.updateUser({ data: { nickname: value } });
    if (error) throw new Error(error.message);
    setSession((current) => current ? { ...current, user: data.user } : current);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, []);

  const metadataNickname = session?.user.user_metadata?.nickname;
  const nickname = typeof metadataNickname === 'string' && metadataNickname.trim()
    ? metadataNickname.trim()
    : session?.user.email?.split('@')[0] ?? 'Titu';
  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    nickname,
    configurationError: isSupabaseConfigured ? null : 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.',
    signIn,
    signUp,
    updateNickname,
    signOut,
  }), [session, isLoading, nickname, signIn, signUp, updateNickname, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
