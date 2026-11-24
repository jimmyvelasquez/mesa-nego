-- Pruebas del flujo de compra (Fase 3).
-- Todo ocurre dentro de una función que termina en ROLLBACK: no deja datos ni filas
-- de audit_log. Si algún paso falla, se ve "FALLO ...". Si todo pasa, devuelve 'FLUJO OK'.

create or replace function public.test_flujo()
returns text
language plpgsql
as $fn$
declare
  b_co  uuid := gen_random_uuid();
  s_co  uuid := gen_random_uuid();
  s2_co uuid := gen_random_uuid();
  u_b   uuid := gen_random_uuid();
  u_s   uuid := gen_random_uuid();
  u_s2  uuid := gen_random_uuid();
  req   uuid;
  tok1  text;
  tok2  text;
  off1  uuid;
  off2  uuid;
  st    text;
  n     int;
  caught boolean;
begin
  -- Datos de prueba
  insert into auth.users (id, email, aud, role) values
    (u_b,  'b-'  || u_b  || '@test.invalid', 'authenticated', 'authenticated'),
    (u_s,  's-'  || u_s  || '@test.invalid', 'authenticated', 'authenticated'),
    (u_s2, 's2-' || u_s2 || '@test.invalid', 'authenticated', 'authenticated');
  insert into public.companies (id, name, kind) values
    (b_co, 'Test comprador', 'buyer'), (s_co, 'Test proveedor', 'supplier'), (s2_co, 'Test proveedor 2', 'supplier');
  insert into public.profiles (id, company_id) values (u_b, b_co), (u_s, s_co), (u_s2, s2_co);
  insert into public.purchase_requests
    (buyer_company_id, created_by, product_name, unit, volume, baseline_price, price_limit, floor_price, counter_pct)
  values (b_co, u_b, 'Polipropileno', '€/t', 40, 1250, 1300, 1150, 0.015)
  returning id into req;

  -- 1. Comprador abre la compra y crea invitaciones
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, false);
  set role authenticated;
  perform public.open_purchase_request(req);
  select status into st from public.purchase_requests where id = req;
  if st <> 'open' then raise exception 'FALLO 1: la compra no quedó abierta (%)', st; end if;

  tok1 := public.create_invitation(req, s_co);
  tok2 := public.create_invitation(req, s2_co);
  if length(tok1) <> 48 then raise exception 'FALLO 2: el token no tiene la longitud esperada'; end if;

  -- 2. No se puede invitar a una empresa que no es proveedor
  caught := false;
  begin
    perform public.create_invitation(req, b_co);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 3: se invitó a una empresa que no es proveedor'; end if;
  reset role;

  -- 3. Proveedor S acepta, envía y corrige su oferta
  perform set_config('request.jwt.claims', json_build_object('sub', u_s, 'role', 'authenticated')::text, false);
  set role authenticated;
  perform public.accept_invitation(tok1);
  off1 := public.submit_offer(req, 1240);
  off1 := public.submit_offer(req, 1205);
  select count(*) into n from public.offers where purchase_request_id = req;
  if n <> 1 then raise exception 'FALLO 4a: la corrección de oferta duplicó la fila (%)', n; end if;
  select price into st from public.offers where id = off1;
  if st::numeric <> 1205 then raise exception 'FALLO 4b: el precio corregido no se guardó (%)', st; end if;

  -- 4. Proveedor no puede abrir compras
  caught := false;
  begin
    perform public.open_purchase_request(req);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 5: un proveedor abrió una compra'; end if;
  reset role;

  -- 5. Proveedor S2 sin aceptar la invitación no puede ofertar
  perform set_config('request.jwt.claims', json_build_object('sub', u_s2, 'role', 'authenticated')::text, false);
  set role authenticated;
  caught := false;
  begin
    perform public.submit_offer(req, 1330);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 6: oferta sin invitación aceptada'; end if;

  -- 6. Proveedor S2 acepta y envía una oferta fuera de límite
  perform public.accept_invitation(tok2);
  off2 := public.submit_offer(req, 1330);
  select within_limit into caught from public.offers where id = off2;
  if caught then raise exception 'FALLO 7: una oferta de 1330 aparece dentro de un límite de 1300'; end if;
  reset role;

  -- 7. El comprador NO puede adjudicar una oferta fuera de límite
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, false);
  set role authenticated;
  caught := false;
  begin
    perform public.approve_award(req, off2);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 8: se adjudicó una oferta fuera de límite'; end if;

  -- 8. El comprador adjudica la oferta dentro de límite
  perform public.approve_award(req, off1);
  select status into st from public.purchase_requests where id = req;
  if st <> 'awarded' then raise exception 'FALLO 9: la compra no quedó adjudicada (%)', st; end if;

  -- 9. No se puede reinvitar a un proveedor que ya aceptó
  caught := false;
  begin
    perform public.create_invitation(req, s_co);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 10: se reinvitó a un proveedor que ya aceptó'; end if;

  -- 10. El proveedor S2 retira su oferta; después no puede modificarla
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_s2, 'role', 'authenticated')::text, false);
  set role authenticated;
  perform public.withdraw_offer(req);
  select status into st from public.offers where id = off2;
  if st <> 'withdrawn' then raise exception 'FALLO 11: la oferta no quedó retirada (%)', st; end if;
  caught := false;
  begin
    perform public.submit_offer(req, 1200);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 12: se modificó una oferta retirada'; end if;
  reset role;

  -- 11. El proveedor no puede aprobar adjudicaciones
  perform set_config('request.jwt.claims', json_build_object('sub', u_s, 'role', 'authenticated')::text, false);
  set role authenticated;
  caught := false;
  begin
    perform public.approve_award(req, off1);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 13: un proveedor aprobó una adjudicación'; end if;
  reset role;

  -- 12. Auditoría: el flujo ha dejado registro
  select count(*) into n from public.audit_log where company_id in (b_co, s_co, s2_co);
  if n < 6 then raise exception 'FALLO 14: el flujo dejó pocas entradas de auditoría (%)', n; end if;

  -- Vuelta atrás de todo lo anterior
  raise exception 'ROLLBACK_TEST';
exception when others then
  if sqlerrm = 'ROLLBACK_TEST' then
    return 'FLUJO OK';
  end if;
  raise;
end;
$fn$;

select public.test_flujo();
drop function public.test_flujo();
