-- Pruebas de RLS y reglas de la Fase 2.
-- Se ejecutan como superusuario (SQL Editor / execute_sql). Cada fallo lanza una excepción
-- con el prefijo FALLO. Si todo pasa, la última sentencia imprime "RLS OK".
-- Los datos de prueba se borran al final; la fila de audit_log de prueba
-- no se puede borrar (es de solo escritura) y queda con company_id nulo.

do $$
declare
  b_co  uuid := gen_random_uuid();
  s_co  uuid := gen_random_uuid();
  s2_co uuid := gen_random_uuid();
  u_b   uuid := gen_random_uuid();
  u_s   uuid := gen_random_uuid();
  u_s2  uuid := gen_random_uuid();
  req   uuid;
  n     int;
  caught boolean;
begin
  -- Datos de prueba (como superusuario, sin RLS)
  insert into auth.users (id, email, aud, role) values
    (u_b,  'b-'  || u_b  || '@test.invalid', 'authenticated', 'authenticated'),
    (u_s,  's-'  || u_s  || '@test.invalid', 'authenticated', 'authenticated'),
    (u_s2, 's2-' || u_s2 || '@test.invalid', 'authenticated', 'authenticated');

  insert into public.companies (id, name, kind) values
    (b_co,  'Test comprador',  'buyer'),
    (s_co,  'Test proveedor',  'supplier'),
    (s2_co, 'Test proveedor 2', 'supplier');

  insert into public.profiles (id, company_id) values (u_b, b_co), (u_s, s_co), (u_s2, s2_co);

  insert into public.purchase_requests
    (buyer_company_id, created_by, product_name, unit, volume, baseline_price, price_limit, floor_price, counter_pct, status)
  values
    (b_co, u_b, 'Polipropileno', '€/t', 40, 1250, 1300, 1150, 0.015, 'open')
  returning id into req;

  insert into public.invitations (purchase_request_id, supplier_company_id, token_hash, expires_at) values
    (req, s_co,  encode(extensions.digest('tok-s',  'sha256'), 'hex'), now() + interval '1 day'),
    (req, s2_co, encode(extensions.digest('tok-s2', 'sha256'), 'hex'), now() + interval '1 day');

  -- 1. La función del proveedor no devuelve límite, suelo ni precio de referencia
  if pg_get_function_result('public.my_supplier_invitations()'::regprocedure) ~* 'price_limit|floor_price|baseline_price|counter_pct' then
    raise exception 'FALLO 1: la función del proveedor expone datos internos';
  end if;

  -- 2. Como proveedor S, antes de aceptar: no ve la compra ni la tabla de invitaciones
  perform set_config('request.jwt.claims', json_build_object('sub', u_s, 'role', 'authenticated')::text, false);
  set role authenticated;

  select count(*) into n from public.purchase_requests;
  if n <> 0 then raise exception 'FALLO 2a: el proveedor ve compras ajenas'; end if;

  select count(*) into n from public.invitations;
  if n <> 0 then raise exception 'FALLO 2b: el proveedor lee la tabla de invitaciones'; end if;

  select count(*) into n from public.my_supplier_invitations();
  if n <> 1 then raise exception 'FALLO 2c: el proveedor no ve su invitación (ve %)', n; end if;

  -- 3. Oferta antes de aceptar la invitación: rechazada
  caught := false;
  begin
    insert into public.offers (purchase_request_id, supplier_company_id, price)
    values (req, s_co, 1205);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 3: oferta aceptada sin invitación aceptada'; end if;

  -- 4. Aceptar la invitación con el token correcto
  perform public.accept_invitation('tok-s');
  reset role;

  -- 5. Otro proveedor no puede aceptar la invitación ajena
  perform set_config('request.jwt.claims', json_build_object('sub', u_s2, 'role', 'authenticated')::text, false);
  set role authenticated;
  caught := false;
  begin
    perform public.accept_invitation('tok-s');
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 5: un proveedor aceptó la invitación de otro'; end if;
  reset role;

  -- 6. El proveedor S envía su oferta: permitida y el límite lo calcula la base de datos
  perform set_config('request.jwt.claims', json_build_object('sub', u_s, 'role', 'authenticated')::text, false);
  set role authenticated;
  insert into public.offers (purchase_request_id, supplier_company_id, price)
  values (req, s_co, 1330)
  ;
  reset role;

  select count(*) into n from public.offers where purchase_request_id = req and within_limit = false;
  if n <> 1 then raise exception 'FALLO 6: within_limit no se calculó en la base de datos'; end if;

  -- 7. El proveedor S solo ve su propia oferta; el proveedor S2 no ve ninguna
  perform set_config('request.jwt.claims', json_build_object('sub', u_s, 'role', 'authenticated')::text, false);
  set role authenticated;
  select count(*) into n from public.offers;
  if n <> 1 then raise exception 'FALLO 7a: el proveedor no ve su oferta'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_s2, 'role', 'authenticated')::text, false);
  set role authenticated;
  select count(*) into n from public.offers;
  if n <> 0 then raise exception 'FALLO 7b: el proveedor 2 ve ofertas ajenas'; end if;
  reset role;

  -- 8. El comprador ve las ofertas de su compra y no las de otras empresas
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, false);
  set role authenticated;
  select count(*) into n from public.offers where purchase_request_id = req;
  if n <> 1 then raise exception 'FALLO 8: el comprador no ve las ofertas de su compra'; end if;

  -- 9. El comprador dueño sí puede registrar su aprobación; un proveedor no
  insert into public.decisions (purchase_request_id, kind, actor_type, actor_id)
  values (req, 'approve_award', 'human', u_b);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_s, 'role', 'authenticated')::text, false);
  set role authenticated;
  caught := false;
  begin
    insert into public.decisions (purchase_request_id, kind, actor_type, actor_id)
    values (req, 'approve_award', 'human', u_s);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 9: un proveedor registró una aprobación de compra'; end if;
  reset role;

  -- 10. El agente nunca puede registrar una aprobación (check de la tabla)
  caught := false;
  begin
    insert into public.decisions (purchase_request_id, kind, actor_type, actor_id)
    values (req, 'approve_award', 'agent', null);
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 10: el agente registró una aprobación'; end if;

  -- 11. audit_log no admite UPDATE ni DELETE, ni siquiera como superusuario
  insert into public.audit_log (company_id, actor_type, action) values (null, 'system', 'test_rls');
  caught := false;
  begin
    update public.audit_log set action = 'alterado' where action = 'test_rls';
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 11a: audit_log permite UPDATE'; end if;

  caught := false;
  begin
    delete from public.audit_log where action = 'test_rls';
  exception when others then caught := true;
  end;
  if not caught then raise exception 'FALLO 11b: audit_log permite DELETE'; end if;

  -- Limpieza (el registro de audit_log de prueba no se puede borrar)
  delete from public.offers where purchase_request_id = req;
  delete from public.invitations where purchase_request_id = req;
  delete from public.purchase_requests where id = req;
  delete from public.profiles where id in (u_b, u_s, u_s2);
  delete from public.companies where id in (b_co, s_co, s2_co);
  delete from auth.users where id in (u_b, u_s, u_s2);

  raise notice 'RLS OK';
end;
$$;
