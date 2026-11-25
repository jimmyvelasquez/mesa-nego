import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile {
  companyId: string;
  companyName: string;
  companyKind: 'buyer' | 'supplier';
  role: 'member' | 'admin';
  fullName: string | null;
}

interface AuthValue {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Carga el perfil y la empresa del usuario. RLS limita la lectura a su propio perfil. */
async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('company_id, role, full_name, companies(name, kind)')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const company = data.companies as unknown as { name: string; kind: 'buyer' | 'supplier' };
  return {
    companyId: data.company_id as string,
    companyName: company.name,
    companyKind: company.kind,
    role: data.role as 'member' | 'admin',
    fullName: (data.full_name as string | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const sync = async (s: Session | null) => {
      if (!active) return;
      setSession(s);
      setError(null);
      if (s) {
        try {
          const p = await loadProfile(s.user.id);
          if (active) setProfile(p);
        } catch (e) {
          if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar tu perfil');
        }
      } else {
        setProfile(null);
      }
      if (active) setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => sync(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      void sync(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ loading, session, profile, error, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
