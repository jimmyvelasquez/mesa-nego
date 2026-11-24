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
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Comprador: pasa una compra de borrador a abierta para ofertas. */
export const openPurchaseRequest = (requestId: string) =>
  call<void>('open_purchase_request', { p_request_id: requestId });

/** Comprador: invita a un proveedor. Devuelve el token en claro, una sola vez. */
export const createInvitation = (requestId: string, supplierCompanyId: string, days = 7) =>
  call<string>('create_invitation', {
    p_request_id: requestId,
    p_supplier_company_id: supplierCompanyId,
    p_days: days,
  });

/** Proveedor: acepta la invitación con el token recibido. Devuelve el id de la compra. */
export const acceptInvitation = (token: string) => call<string>('accept_invitation', { p_token: token });

/** Proveedor: lista sus invitaciones (sin límite, suelo ni precio de referencia). */
export const listMyInvitations = () => call<SupplierInvitation[]>('my_supplier_invitations');

/** Proveedor: envía o corrige su oferta mientras esté en estado 'submitted'. */
export const submitOffer = (requestId: string, price: number) =>
  call<string>('submit_offer', { p_request_id: requestId, p_price: price });

/** Proveedor: retira su oferta. */
export const withdrawOffer = (requestId: string) => call<void>('withdraw_offer', { p_request_id: requestId });

/** Comprador: adjudica una oferta dentro de límite (aprobación humana). */
export const approveAward = (requestId: string, offerId: string) =>
  call<void>('approve_award', { p_request_id: requestId, p_offer_id: offerId });
