import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY (ver .env.example)');
}

/** Cliente de Supabase para el navegador. Usa la clave publicable; el acceso lo controla RLS. */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
