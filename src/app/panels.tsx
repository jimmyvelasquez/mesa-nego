import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import {
  acceptInvitation,
  approveAward,
  listBuyerOffers,
  listSupplierCompanies,
  rejectOffer,
  type SupplierCompany,
  listMyInvitations,
  listMyOffers,
  openPurchaseRequest,
  sendInvitationEmail,
  submitOffer,
  withdrawOffer,
  type BuyerOffer,
  type SupplierInvitation,
  type SupplierOffer,
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
function InviteForm({ requests, suppliers }: { requests: RequestRow[]; suppliers: SupplierCompany[] }) {
  const [requestId, setRequestId] = useState('');
  const [mode, setMode] = useState<'existing' | 'new'>(suppliers.length > 0 ? 'existing' : 'new');
  const [supplierCompanyId, setSupplierCompanyId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const targetReady = mode === 'existing' ? supplierCompanyId !== '' : supplierName.trim() !== '';

  async function send(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSending(true);
    try {
      await sendInvitationEmail(
        requestId,
        email.trim(),
        mode === 'existing' ? { supplierCompanyId } : { supplierName: supplierName.trim() },
      );
      setEmail('');
      setSupplierName('');
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
      <div className="actions">
        <button type="button" disabled={mode === 'existing'} onClick={() => setMode('existing')}>
          Proveedor existente
        </button>
        <button type="button" disabled={mode === 'new'} onClick={() => setMode('new')}>
          Proveedor nuevo
        </button>
      </div>
      {mode === 'existing' ? (
        <>
          <label htmlFor="inv-supplier">Empresa proveedora</label>
          <select
            id="inv-supplier"
            value={supplierCompanyId}
            onChange={(e) => setSupplierCompanyId(e.target.value)}
            required
          >
            <option value="">Selecciona un proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label htmlFor="inv-name">Nombre de la empresa proveedora</label>
          <input id="inv-name" type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} required />
        </>
      )}
      <label htmlFor="inv-email">Correo del proveedor</label>
      <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <p className="note">La invitación solo funciona con este correo: el proveedor debe entrar con él.</p>
      <div className="actions">
        <span className="note"></span>
        <button className="primary" type="submit" disabled={sending || !requestId || !targetReady || !email}>
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
  const [offers, setOffers] = useState<BuyerOffer[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierCompany[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: loadError } = await supabase
      .from('purchase_requests')
      .select('id, product_name, status, created_at')
      .order('created_at', { ascending: false });
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRows((data ?? []) as RequestRow[]);
    try {
      setOffers(await listBuyerOffers());
      setSuppliers(await listSupplierCompanies());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las ofertas');
    }
  }

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 8) + '…';

  async function award(requestId: string, offerId: string) {
    setError(null);
    try {
      await approveAward(requestId, offerId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo adjudicar la oferta');
    }
  }

  async function reject(requestId: string, offerId: string) {
    setError(null);
    try {
      await rejectOffer(requestId, offerId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo rechazar la oferta');
    }
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
      <h3>Ofertas recibidas</h3>
      {offers.length === 0 ? (
        <p className="note">Todavía no hay ofertas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Proveedor</th>
              <th>Precio</th>
              <th>Dentro de límite</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => {
              const request = rows.find((r) => r.id === o.purchase_request_id);
              const canAward =
                request?.status === 'open' && o.status === 'submitted' && o.within_limit;
              return (
                <tr key={o.id}>
                  <td>{request?.product_name ?? '—'}</td>
                  <td>{supplierName(o.supplier_company_id)}</td>
                  <td>{o.price}</td>
                  <td>{o.within_limit ? 'Sí' : 'No'}</td>
                  <td>{o.status}</td>
                  <td>
                    {canAward && (
                      <button className="primary" onClick={() => award(o.purchase_request_id, o.id)}>
                        Adjudicar
                      </button>
                    )}
                    {request?.status === 'open' && o.status === 'submitted' && (
                      <button onClick={() => reject(o.purchase_request_id, o.id)}>Rechazar</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {rows.length > 0 && (
        <InviteForm requests={rows.filter((r) => r.status !== 'cancelled')} suppliers={suppliers} />
      )}
    </section>
  );
}

/** Fila de oferta del proveedor: enviar o corregir el precio, o retirar la oferta. */
function OfferRow({
  invitation,
  offer,
  onChanged,
}: {
  invitation: SupplierInvitation;
  offer: SupplierOffer | undefined;
  onChanged: () => Promise<void>;
}) {
  const [price, setPrice] = useState(offer ? String(offer.price) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = !offer || offer.status === 'submitted';

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la oferta');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{invitation.product_name}</td>
      <td>{offer ? offer.status : 'Sin oferta'}</td>
      <td>
        {editable ? (
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label={`Precio para ${invitation.product_name}`}
          />
        ) : (
          offer?.price
        )}
      </td>
      <td>
        {editable && (
          <button
            className="primary"
            disabled={busy || price.trim() === '' || Number(price) <= 0}
            onClick={() => run(() => submitOffer(invitation.purchase_request_id, Number(price)))}
          >
            {offer ? 'Actualizar' : 'Enviar oferta'}
          </button>
        )}
        {offer?.status === 'submitted' && (
          <button disabled={busy} onClick={() => run(() => withdrawOffer(invitation.purchase_request_id))}>
            Retirar
          </button>
        )}
        {error && <p className="msg error">{error}</p>}
      </td>
    </tr>
  );
}

/** Panel del proveedor: acepta invitaciones con el token y lista las suyas. */
export function SupplierPanel({ profile }: { profile: Profile }) {
  const [invitations, setInvitations] = useState<SupplierInvitation[]>([]);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function load() {
    try {
      setInvitations(await listMyInvitations());
      setOffers(await listMyOffers());
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
        <h2>Mis ofertas</h2>
        {invitations.filter((i) => i.status === 'accepted').length === 0 ? (
          <p className="note">Acepta una invitación para poder enviar una oferta.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Estado</th>
                <th>Precio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations
                .filter((i) => i.status === 'accepted')
                .map((i) => (
                  <OfferRow
                    key={i.id}
                    invitation={i}
                    offer={offers.find((o) => o.purchase_request_id === i.purchase_request_id)}
                    onChanged={load}
                  />
                ))}
            </tbody>
          </table>
        )}
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

/** Usuario sin empresa: acepta una invitación con el código y entra como proveedor. */
export function NewSupplierPanel() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await acceptInvitation(token.trim());
      // Recargar: el perfil nuevo se lee al iniciar la app.
      window.location.replace('/app');
    } catch (err) {
      setBusy(false);
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo aceptar la invitación' });
    }
  }

  return (
    <section className="card narrow">
      <h2>Aceptar una invitación</h2>
      <p className="note">Pega el código que te enviaron. Debes entrar con el correo al que llegó la invitación.</p>
      <form onSubmit={accept}>
        <label htmlFor="token">Código de invitación</label>
        <input id="token" type="text" value={token} onChange={(e) => setToken(e.target.value)} required />
        <div className="actions">
          <span className="note"></span>
          <button className="primary" type="submit" disabled={busy || token.trim() === ''}>
            {busy ? 'Aceptando…' : 'Aceptar'}
          </button>
        </div>
      </form>
      {message && <p className={`msg ${message.kind}`}>{message.text}</p>}
    </section>
  );
}
