# Mesa Nego

Demo de negociación asistida por agente para compras. Datos ficticios, ERP simulado.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # tests de reglas y flujo
npm run build    # comprobación de tipos + build de producción
```

## Estructura

- `src/lib/rules.ts`: reglas puras (evaluar ofertas, contraoferta, ahorro).
- `src/lib/negotiation.ts`: reducer del flujo de nueve pasos y registro de auditoría.
- `src/data/cases.ts`: casos ficticios de demostración.
- `src/components/`: interfaz (pasos, selector de caso, auditoría).
- `docs/demo-original.html`: versión de una sola página usada como referencia.

## Pendiente (fases siguientes)

- Persistencia y autenticación (Supabase, RLS).
- Motor del agente real (hoy: contraoferta por porcentaje fijo).
- Integración con ERP.
