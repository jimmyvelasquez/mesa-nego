import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Inicio de sesión con enlace mágico. No crea cuentas nuevas: el alta la hace
 * un administrador, así que solo entran usuarios ya dados de alta.
 */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        shouldCreateUser: false,
      },
    });

    setBusy(false);
    if (authError) {
      setError('No pudimos enviar el enlace. Revisa el correo o pide al administrador que te dé de alta.');
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <section className="card narrow">
        <h2>Revisa tu correo</h2>
        <p className="note">Te hemos enviado un enlace para entrar a {email}. Ábrelo en este mismo navegador.</p>
      </section>
    );
  }

  return (
    <section className="card narrow">
      <h2>Entrar en Mesa Nego</h2>
      <form onSubmit={submit}>
        <label htmlFor="email">Correo</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.com"
        />
        <div className="actions">
          <span className="note"></span>
          <button className="primary" type="submit" disabled={busy || email.trim() === ''}>
            {busy ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </div>
      </form>
      {error && <p className="msg error">{error}</p>}
    </section>
  );
}
