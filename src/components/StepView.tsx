import type { Dispatch } from 'react';
import type { Action, NegotiationState } from '../lib/negotiation';
import { savings, winner } from '../lib/negotiation';
import type { PurchaseCase } from '../lib/types';
import { now } from '../lib/time';

interface Props {
  caseData: PurchaseCase;
  flow: NegotiationState;
  dispatch: Dispatch<Action>;
}

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

export function StepView({ caseData: c, flow, dispatch }: Props) {
  switch (flow.step) {
    case 0:
      return (
        <>
          <h2>1. Definir la compra</h2>
          <p className="note">El comprador fija el producto, el volumen y el precio máximo que acepta. El agente no puede salirse de estos límites.</p>
          <div className="grid2">
            <div>
              <label>Producto</label>
              <input type="text" value={c.name} disabled />
              <label>Volumen</label>
              <input type="number" value={c.volume} disabled />
            </div>
            <div>
              <label>Precio de referencia ({c.unit})</label>
              <input type="number" value={c.baseline} disabled />
              <label>Precio máximo aceptado ({c.unit})</label>
              <input type="number" value={c.limit} disabled />
            </div>
          </div>
          <div className="actions">
            <span className="note">{c.buyer}</span>
            <button className="primary" onClick={() => dispatch({ type: 'advance', at: now() })}>
              Continuar
            </button>
          </div>
        </>
      );

    case 1:
      return (
        <>
          <h2>2. Invitar proveedores</h2>
          <p className="note">Cada proveedor ve solo su propia oferta. Selecciona a quién invitar.</p>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {c.suppliers.map((s, i) => (
                <tr key={s.name}>
                  <td>
                    <input
                      type="checkbox"
                      checked={flow.invited.includes(i)}
                      onChange={() => dispatch({ type: 'toggleInvite', index: i })}
                    />
                  </td>
                  <td>{s.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <span className="note">Invitados: {flow.invited.length}</span>
            <button
              className="primary"
              disabled={flow.invited.length < 2}
              onClick={() => dispatch({ type: 'sendInvites', caseData: c, at: now() })}
            >
              Enviar invitaciones
            </button>
          </div>
        </>
      );

    case 2: {
      const invited = flow.invited.map((i) => c.suppliers[i]);
      return (
        <>
          <h2>3. Ofertas recibidas</h2>
          <p className="note">Precios simulados. Los proveedores no ven las ofertas de los demás.</p>
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Precio ({c.unit})</th>
              </tr>
            </thead>
            <tbody>
              {invited.map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td>{fmt(o.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <span className="note">
              Referencia: {fmt(c.baseline)} · Límite: {fmt(c.limit)}
            </span>
            <button className="primary" onClick={() => dispatch({ type: 'advance', at: now() })}>
              Evaluar con reglas
            </button>
          </div>
        </>
      );
    }

    case 3: {
      const evaluated = flow.evaluation;
      return (
        <>
          <h2>4. Evaluación con reglas</h2>
          <p className="note">Las ofertas dentro de límite pueden seguir negociándose. Las que están fuera pasan a una persona.</p>
          {evaluated === null ? (
            <div className="actions">
              <span className="note"></span>
              <button className="primary" onClick={() => dispatch({ type: 'evaluate', caseData: c, at: now() })}>
                Ejecutar evaluación
              </button>
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>Precio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluated.map((o) => (
                    <tr key={o.name}>
                      <td>{o.name}</td>
                      <td>{fmt(o.price)}</td>
                      <td>
                        {o.within ? (
                          <span className="tag ok">Dentro de límite</span>
                        ) : (
                          <span className="tag bad">Fuera de límite</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="actions">
                <span className="note"></span>
                <button
                  className="primary"
                  disabled={!evaluated.some((o) => o.within)}
                  onClick={() => dispatch({ type: 'advance', at: now() })}
                >
                  Iniciar negociación
                </button>
              </div>
            </>
          )}
        </>
      );
    }

    case 4: {
      const best = winner(flow);
      return (
        <>
          <h2>5. Negociación del agente</h2>
          <p className="note">El agente compara ofertas y responde a los proveedores dentro de los límites fijados.</p>
          {flow.counterFinal === null || best === undefined ? (
            <div className="actions">
              <span className="note"></span>
              <button
                className="primary"
                disabled={best === undefined}
                onClick={() => dispatch({ type: 'negotiate', caseData: c, at: now() })}
              >
                Ejecutar ronda del agente
              </button>
            </div>
          ) : (
            <>
              <div className="kpi">
                <div>
                  <span>Mejor oferta inicial</span>
                  <strong>{fmt(best.price)}</strong>
                </div>
                <div>
                  <span>Contraoferta final</span>
                  <strong>{fmt(flow.counterFinal)}</strong>
                </div>
                <div>
                  <span>Ahorro frente a referencia</span>
                  <strong>{pct(savings(c, flow))}</strong>
                </div>
              </div>
              <p className="note" style={{ marginTop: 12 }}>
                Proveedor: {best.name}
              </p>
              <div className="actions">
                <span className="note"></span>
                <button className="primary" onClick={() => dispatch({ type: 'advance', at: now() })}>
                  Pasar a revisión humana
                </button>
              </div>
            </>
          )}
        </>
      );
    }

    case 5: {
      const outside = flow.evaluation?.filter((o) => !o.within) ?? [];
      if (outside.length === 0) {
        return (
          <>
            <h2>6. Revisión humana</h2>
            <p className="note">No hay ofertas fuera de límite. No es necesaria ninguna acción adicional.</p>
            <div className="actions">
              <span className="note"></span>
              <button className="primary" onClick={() => dispatch({ type: 'advance', at: now() })}>
                Continuar a adjudicación
              </button>
            </div>
          </>
        );
      }
      return (
        <>
          <h2>6. Revisión humana</h2>
          <p className="note">Las ofertas fuera de límite nunca se adjudican sin la aprobación de una persona.</p>
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Precio</th>
                <th>Exceso sobre límite</th>
              </tr>
            </thead>
            <tbody>
              {outside.map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td>{fmt(o.price)}</td>
                  <td>
                    {fmt(o.price - c.limit)} {c.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="check">
            <input
              type="checkbox"
              checked={flow.approved}
              onChange={(e) => dispatch({ type: 'setApproved', value: e.target.checked })}
            />
            Apruebo mantener las ofertas fuera de límite como alternativa (decisión del comprador)
          </label>
          <div className="actions">
            <span className="note"></span>
            <button className="primary" onClick={() => dispatch({ type: 'advance', at: now() })}>
              Continuar a adjudicación
            </button>
          </div>
        </>
      );
    }

    case 6: {
      const best = winner(flow);
      if (best === undefined || flow.counterFinal === null) {
        return <p className="note">No hay adjudicación posible: ninguna oferta cumple el límite.</p>;
      }
      return (
        <>
          <h2>7. Adjudicación</h2>
          <p className="note">La adjudicación final la confirma una persona.</p>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Producto</td>
                <td>{c.name}</td>
              </tr>
              <tr>
                <td>Proveedor adjudicado</td>
                <td>{best.name}</td>
              </tr>
              <tr>
                <td>Precio</td>
                <td>
                  {fmt(flow.counterFinal)} {c.unit}
                </td>
              </tr>
              <tr>
                <td>Volumen</td>
                <td>{c.volume}</td>
              </tr>
              <tr>
                <td>Importe total (simulado)</td>
                <td>{fmt(flow.counterFinal * c.volume)} €</td>
              </tr>
            </tbody>
          </table>
          <div className="actions">
            <span className="note"></span>
            <button className="primary" onClick={() => dispatch({ type: 'advance', at: now() })}>
              Confirmar adjudicación
            </button>
          </div>
        </>
      );
    }

    case 7:
      return (
        <>
          <h2>8. Envío al ERP</h2>
          <p className="note">ERP simulado. No hay ninguna conexión con sistemas reales.</p>
          {flow.erpId === null ? (
            <div className="actions">
              <span className="note"></span>
              <button
                className="primary"
                onClick={() =>
                  dispatch({
                    type: 'sendToErp',
                    id: `PO-${Math.floor(100000 + Math.random() * 900000)}`,
                    at: now(),
                  })
                }
              >
                Enviar pedido al ERP
              </button>
            </div>
          ) : (
            <>
              <div className="kpi">
                <div>
                  <span>Número de pedido</span>
                  <strong>{flow.erpId}</strong>
                </div>
                <div>
                  <span>Estado</span>
                  <strong>
                    <span className="tag ok">Creado</span>
                  </strong>
                </div>
              </div>
              <div className="actions">
                <span className="note"></span>
                <button className="primary" onClick={() => dispatch({ type: 'advance', at: now() })}>
                  Ver auditoría
                </button>
              </div>
            </>
          )}
        </>
      );

    default: {
      const best = winner(flow);
      return (
        <>
          <h2>9. Resumen final</h2>
          <div className="kpi">
            <div>
              <span>Ahorro frente a referencia</span>
              <strong>{pct(savings(c, flow))}</strong>
            </div>
            <div>
              <span>Proveedor</span>
              <strong className="small">{best?.name ?? '—'}</strong>
            </div>
            <div>
              <span>Pedido ERP</span>
              <strong className="small">{flow.erpId ?? '—'}</strong>
            </div>
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            Todos los datos son ficticios.
          </p>
          <div className="actions">
            <span className="note"></span>
            <button onClick={() => dispatch({ type: 'restart', caseData: c, at: now() })}>Reiniciar demo</button>
          </div>
        </>
      );
    }
  }
}
