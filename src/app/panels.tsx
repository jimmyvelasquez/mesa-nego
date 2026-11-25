import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import {
  acceptInvitation,
  listMyInvitations,
  openPurchaseRequest,
  sendInvitationEmail,
  type SupplierInvitation,
} from '../lib/api';
import type { Profile } from './AuthContext';

interface RequestRow {
  id: string;
  product_name: string;
  status: 'draft' | 'open' | 'awarded' | 'cancelled';
  created_at: string;
}

const STATUS_LABEL: Record<RequestRow['status'], string> = {
  draft: 'Borrador',
  open: 'Abierta',
  awarded: 'Adjudicada',
  cancelled: 'Cancelada',
};

/** Formulario del comprador: envía por correo la invitación de una compra a un proveedor. */
function InviteForm({ requests }: { requests: RequestRow[] }) {
  const [requestId, setRequestId] = useState('');
  const [supplierCompanyId, setSupplierCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSending(true);
    try {
      await sendInvitationEmail(requestId, supplierCompanyId.trim(), email.trim());
      setEmail('');
      setMessage({ kind: 'ok', text: 'Invitación enviada por correo.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo enviar la invitación' });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send}>
      <h3>Invitar proveedor</h3>
      <label htmlFor="inv-request">Compra</label>
      <select id="inv-request" value={requestId} onChange={(e) => setRequestId(e.target.value)} required>
        <option value="">Selecciona una compra</option>
        {requests.map((r) => (
          <option key={r.id} value={r.id}>
            {r.product_name}
          </option>
        ))}
      </select>
      <label htmlFor="inv-supplier">ID de la empresa proveedora</label>
      <input
        id="inv-supplier"
        type="text"
        value={supplierCompanyId}
        onChange={(e) => setSupplierCompanyId(e.target.value)}
        required
      />
      <label htmlFor="inv-email">Correo del proveedor</label>
      <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <div className="actions">
        <span className="note"></span>
        <button className="primary" type="submit" disabled={sending || !requestId || !supplierCompanyId || !email}>
          {sending ? 'Enviando…' : 'Enviar invitación'}
        </button>
      </div>
      {message && <p className={`msg ${message.kind}`}>{message.text}</p>}
    </form>
  );
}

/** Panel del comprador: lista sus compras y permite abrir las que estén en borrador. */
export function BuyerPanel() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: loadError } = await supabase
      .from('purchase_requests')
      .select('id, product_name, status, created_at')
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setRows((data ?? []) as RequestRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function open(id: string) {
    setError(null);
    try {
      await openPurchaseRequest(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la compra');
    }
  }

  return (
    <section className="card">
      <h2>Mis compras</h2>
      {error && <p className="msg error">{error}</p>}
      {rows.length === 0 ? (
        <p className="note">Todavía no tienes compras. La creación de compras llegará en el siguiente paso.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.product_name}</td>
                <td>{STATUS_LABEL[r.status]}</td>
                <td>
                  {r.status === 'draft' && (
                    <button onClick={() => open(r.id)}>Abrir para ofertas</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && <InviteForm requests={rows.filter((r) => r.status !== 'cancelled')} />}
    </section>
  );
}

/** Panel del proveedor: acepta invitaciones con el token y lista las suyas. */
export function SupplierPanel({ profile }: { profile: Profile }) {
  const [invitations, setInvitations] = useState<SupplierInvitation[]>([]);
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function load() {
    try {
      setInvitations(await listMyInvitations());
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudieron cargar las invitaciones' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function accept(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await acceptInvitation(token.trim());
      setToken('');
      setMessage({ kind: 'ok', text: 'Invitación aceptada. Ya puedes enviar tu oferta cuando la compra esté abierta.' });
      await load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo aceptar la invitación' });
    }
  }

  return (
    <>
      <section className="card">
        <h2>Aceptar una invitación</h2>
        <p className="note">Pega el código que te ha enviado el comprador para {profile.companyName}.</p>
        <form onSubmit={accept}>
          <label htmlFor="token">Código de invitación</label>
          <input id="token" type="text" value={token} onChange={(e) => setToken(e.target.value)} required />
          <div className="actions">
            <span className="note"></span>
            <button className="primary" type="submit" disabled={token.trim() === ''}>
              Aceptar
            </button>
          </div>
        </form>
        {message && <p className={`msg ${message.kind}`}>{message.text}</p>}
      </section>

      <section className="card">
        <h2>Mis invitaciones</h2>
        {invitations.length === 0 ? (
          <p className="note">No tienes invitaciones todavía.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Volumen</th>
                <th>Estado</th>
                <th>Caduca</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id}>
                  <td>{i.product_name}</td>
                  <td>
                    {i.volume} {i.unit}
                  </td>
                  <td>{i.status}</td>
                  <td>{new Date(i.expires_at).toLocaleDateString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
