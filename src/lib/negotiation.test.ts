import { describe, expect, it } from 'vitest';
import { CASES } from '../data/cases';
import { initialState, reducer, winner, type NegotiationState } from './negotiation';

const AT = '2026-11-25T00:00:00.000Z';
const pp = CASES[0];

function run(actions: Parameters<typeof reducer>[1][]): NegotiationState {
  return actions.reduce((s, a) => reducer(s, a), initialState(pp, AT));
}

describe('reducer de la negociación', () => {
  it('recorre el flujo feliz hasta la auditoría final', () => {
    const s = run([
      { type: 'toggleInvite', index: 0 },
      { type: 'toggleInvite', index: 1 },
      { type: 'sendInvites', caseData: pp, at: AT },
      { type: 'advance', at: AT }, // ofertas -> evaluar
      { type: 'evaluate', caseData: pp, at: AT },
      { type: 'advance', at: AT }, // evaluar -> negociar
      { type: 'negotiate', caseData: pp, at: AT },
      { type: 'advance', at: AT }, // negociar -> revisión
      { type: 'advance', at: AT }, // revisión -> adjudicar
      { type: 'advance', at: AT }, // adjudicar -> ERP
      { type: 'sendToErp', id: 'PO-123456', at: AT },
      { type: 'advance', at: AT }, // ERP -> auditoría final
    ]);
    expect(s.step).toBe(8);
    expect(s.erpId).toBe('PO-123456');
    expect(s.audit[s.audit.length - 1]?.message).toBe('Proceso completado');
  });

  it('no permite negociar sin evaluación previa', () => {
    const before = initialState(pp, AT);
    expect(reducer(before, { type: 'negotiate', caseData: pp, at: AT })).toBe(before);
  });

  it('la ganadora es la oferta más barata dentro de límite', () => {
    const s = run([
      { type: 'toggleInvite', index: 0 },
      { type: 'toggleInvite', index: 1 },
      { type: 'toggleInvite', index: 2 },
      { type: 'sendInvites', caseData: pp, at: AT },
      { type: 'evaluate', caseData: pp, at: AT },
    ]);
    expect(winner(s)?.name).toBe('Resinas Sur');
  });

  it('desmarcar un proveedor lo quita de la invitación', () => {
    const s = run([
      { type: 'toggleInvite', index: 0 },
      { type: 'toggleInvite', index: 0 },
    ]);
    expect(s.invited).toEqual([]);
  });
});
