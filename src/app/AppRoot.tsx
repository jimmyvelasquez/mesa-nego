import { AuthProvider, useAuth } from './AuthContext';
import { LoginForm } from './LoginForm';
import { BuyerPanel, SupplierPanel } from './panels';

/** Área autenticada de Mesa Nego, en la ruta /app. */
export default function AppRoot() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { loading, session, profile, error, signOut } = useAuth();

  if (loading) {
    return <p className="center note">Cargando…</p>;
  }

  if (!session) {
    return (
      <Shell>
        <LoginForm />
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell onSignOut={signOut}>
        <section className="card narrow">
          <p className="msg error">{error}</p>
        </section>
      </Shell>
    );
  }

  if (!profile) {
    return (
      <Shell onSignOut={signOut}>
        <section className="card narrow">
          <h2>Cuenta sin empresa</h2>
          <p className="note">
            Tu usuario todavía no está asignado a ninguna empresa. Pide al administrador que te dé de alta.
          </p>
        </section>
      </Shell>
    );
  }

  return (
    <Shell onSignOut={signOut} companyName={profile.companyName}>
      {profile.companyKind === 'buyer' ? <BuyerPanel /> : <SupplierPanel profile={profile} />}
    </Shell>
  );
}

function Shell({
  children,
  onSignOut,
  companyName,
}: {
  children: React.ReactNode;
  onSignOut?: () => Promise<void>;
  companyName?: string;
}) {
  return (
    <>
      <header className="app-header">
        <div>
          <h1>Mesa Nego</h1>
          <small>{companyName ? `${companyName}` : 'Acceso'}</small>
        </div>
        {onSignOut && (
          <button onClick={() => void onSignOut()}>Salir</button>
        )}
      </header>
      <main>{children}</main>
    </>
  );
}
