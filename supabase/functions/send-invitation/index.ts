import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Envía por correo el código de invitación a un proveedor.
 * - Valida la sesión del comprador (verify_jwt) y deja que invite_supplier
 *   compruebe rol, pertenencia y estado con el JWT del propio llamante.
 * - Puede invitar a una empresa existente (supplier_company_id) o crear una nueva (supplier_name).
 * - El código solo viaja por correo; no se devuelve al navegador.
 */

const APP_URL = Deno.env.get('APP_URL') ?? 'https://mesa-nego.vercel.app';
const FROM = Deno.env.get('INVITE_FROM') ?? 'Mesa Nego <no-reply@mail.intiempresas.com>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Body {
  request_id?: string;
  supplier_company_id?: string;
  supplier_name?: string;
  email?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo JSON no válido' }, 400);
  }

  const requestId = body.request_id?.trim();
  const supplierCompanyId = body.supplier_company_id?.trim() || null;
  const supplierName = body.supplier_name?.trim() || null;
  const email = body.email?.trim().toLowerCase();
  if (!requestId || !email || !email.includes('@') || (!supplierCompanyId && !supplierName)) {
    return json({ error: 'Faltan datos: compra, correo y empresa proveedora' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: token, error: rpcError } = await supabase.rpc('invite_supplier', {
    p_request_id: requestId,
    p_email: email,
    p_supplier_company_id: supplierCompanyId,
    p_supplier_name: supplierCompanyId ? null : supplierName,
    p_days: 7,
  });
  if (rpcError) return json({ error: rpcError.message }, 403);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'Falta el secreto RESEND_API_KEY' }, 500);

  const link = `${APP_URL}/app?token=${encodeURIComponent(token as string)}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: 'Invitación a una compra en Mesa Nego',
      html: `<p>Has sido invitado a presentar una oferta en Mesa Nego.</p><p>Entra con este mismo correo (${email}) para aceptarla.</p><p><a href="${link}">Aceptar la invitación</a></p><p>Si el enlace no funciona, copia este código en la pantalla de invitación:</p><p><code>${token}</code></p><p>La invitación caduca en 7 días y solo puede usarse una vez.</p>`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: 'No se pudo enviar el correo', detail }, 502);
  }

  return json({ ok: true });
});
