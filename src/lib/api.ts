import { supabase } from './supabase';

/**
 * Funciones de la API del flujo de compra. Cada una llama a una función SQL
 * que valida rol, pertenencia y estado en la base de datos.
 * Los errores de la base de datos llegan como Error con el mensaje en español.
 */

export interface SupplierInvitation {
  id: string;
  purchase_request_id: string;
  supplier_company_id: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  product_name: string;
  unit: string;
  volume: number;
  request_status: 'draft' | 'open' | 'awarded' | 'cancelled';
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Comprador: pasa una compra de borrador a abierta para ofertas. */
export const openPurchaseRequest = (requestId: string) =>
  call<void>('open_purchase_request', { p_request_id: requestId });

/** Comprador: invita a un proveedor existente. Devuelve el token en claro, una sola vez. */
export const createInvitation = (requestId: string, supplierCompanyId: string, days = 7) =>
  call<string>('create_invitation', {
    p_request_id: requestId,
    p_supplier_company_id: supplierCompanyId,
    p_days: days,
  });

/** Comprador: crea la invitación y la envía por correo (Edge Function send-invitation). El código no se muestra en pantalla. */
export async function sendInvitationEmail(
  requestId: string,
  email: string,
  target: { supplierCompanyId?: string; supplierName?: string },
): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; detail?: string }>(
    'send-invitation',
    {
      body: {
        request_id: requestId,
        email,
        supplier_company_id: target.supplierCompanyId,
        supplier_name: target.supplierName,
      },
    },
  );
  if (error) {
    // Con un estado no 2xx, el cuerpo JSON de la función trae el motivo real.
    const body = (await error.context?.json().catch(() => null)) as { error?: string; detail?: string } | null;
    throw new Error(body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ''}` : error.message);
  }
  if (data?.error) throw new Error(data.error);
}

/** Proveedor: acepta la invitación con el token recibido. Devuelve el id de la compra. */
export const acceptInvitation = (token: string) => call<string>('accept_invitation', { p_token: token });

/** Proveedor: lista sus invitaciones (sin límite, suelo ni precio de referencia). */
export const listMyInvitations = () => call<SupplierInvitation[]>('my_supplier_invitations');

export interface SupplierOffer {
  purchase_request_id: string;
  price: number;
  status: 'submitted' | 'countered' | 'withdrawn' | 'rejected';
}

export interface BuyerOffer {
  id: string;
  purchase_request_id: string;
  supplier_company_id: string;
  price: number;
  status: 'submitted' | 'countered' | 'withdrawn' | 'rejected';
  within_limit: boolean;
}

export interface SupplierCompany {
  id: string;
  name: string;
}

/** Comprador: lista las empresas proveedoras (id y nombre) para invitarlas o identificarlas. */
export const listSupplierCompanies = () => call<SupplierCompany[]>('list_supplier_companies');

/** Comprador: rechaza una oferta en estado 'submitted' (decisión humana, queda en decisions y audit_log). */
export const rejectOffer = (requestId: string, offerId: string) =>
  call<void>('reject_offer', { p_request_id: requestId, p_offer_id: offerId });

/** Comprador: lee las ofertas de sus compras (la política RLS limita la lectura a sus compras). */
export async function listBuyerOffers(): Promise<BuyerOffer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('id, purchase_request_id, supplier_company_id, price, status, within_limit');
  if (error) throw new Error(error.message);
  return (data ?? []) as BuyerOffer[];
}

/** Proveedor: lee sus propias ofertas (la política RLS limita la lectura a su empresa). */
export async function listMyOffers(): Promise<SupplierOffer[]> {
  const { data, error } = await supabase.from('offers').select('purchase_request_id, price, status');
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierOffer[];
}

/** Proveedor: envía o corrige su oferta mientras esté en estado 'submitted'. */
export const submitOffer = (requestId: string, price: number) =>
  call<string>('submit_offer', { p_request_id: requestId, p_price: price });

/** Proveedor: retira su oferta. */
export const withdrawOffer = (requestId: string) => call<void>('withdraw_offer', { p_request_id: requestId });

/** Comprador: adjudica una oferta dentro de límite (aprobación humana). */
export const approveAward = (requestId: string, offerId: string) =>
  call<void>('approve_award', { p_request_id: requestId, p_offer_id: offerId });
