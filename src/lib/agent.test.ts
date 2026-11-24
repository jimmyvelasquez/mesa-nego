import { describe, expect, it } from 'vitest';
import { ruleAgent, type AgentAction } from './agent';

const base = { limit: 1300, counterPct: 0.015 };

describe('ruleAgent', () => {
  it('no hace nada sin ofertas', () => {
    expect(ruleAgent.decide({ ...base, offers: [] })).toEqual([]);
  });

  it('escala a una persona las ofertas fuera de límite', () => {
    const actions = ruleAgent.decide({
      ...base,
      offers: [
        { name: 'Norte', price: 1240 },
        { name: 'Este', price: 1330 },
      ],
    });
    expect(actions).toContainEqual({ type: 'escalate', supplier: 'Este', reason: 'outside_limit' });
  });

  it('no propone contraoferta si ninguna oferta está dentro de límite', () => {
    const actions = ruleAgent.decide({ ...base, offers: [{ name: 'Este', price: 1330 }] });
    expect(actions.some((a) => a.type === 'counter' || a.type === 'propose_award')).toBe(false);
    expect(actions).toEqual([{ type: 'escalate', supplier: 'Este', reason: 'outside_limit' }]);
  });

  it('contraoferta a la mejor oferta dentro de límite', () => {
    const actions = ruleAgent.decide({
      ...base,
      offers: [
        { name: 'Norte', price: 1240 },
        { name: 'Sur', price: 1205 },
      ],
    });
    expect(actions).toContainEqual({ type: 'counter', supplier: 'Sur', price: 1187 });
  });

  it('una adjudicación es siempre una propuesta que requiere aprobación humana', () => {
    const actions = ruleAgent.decide({ ...base, offers: [{ name: 'Sur', price: 1205 }] });
    const award = actions.find((a) => a.type === 'propose_award');
    expect(award).toEqual({ type: 'propose_award', supplier: 'Sur', price: 1187, requiresHumanApproval: true });
  });

  it('nunca emite una adjudicación final sin aprobación humana', () => {
    const actions: AgentAction[] = ruleAgent.decide({ ...base, offers: [{ name: 'Sur', price: 1205 }] });
    for (const a of actions) {
      expect(a.type).not.toBe('award');
    }
  });

  it('respeta el suelo: la contraoferta no baja de él', () => {
    const actions = ruleAgent.decide({
      limit: 300,
      counterPct: 0.5,
      floor: 250,
      offers: [{ name: 'Sur', price: 298 }],
    });
    expect(actions).toContainEqual({ type: 'counter', supplier: 'Sur', price: 250 });
  });

  it('nunca sube el precio aunque el suelo esté por encima de la oferta', () => {
    const actions = ruleAgent.decide({
      limit: 300,
      counterPct: 0.02,
      floor: 500,
      offers: [{ name: 'Sur', price: 298 }],
    });
    expect(actions).toContainEqual({ type: 'counter', supplier: 'Sur', price: 298 });
  });

  it('gana la primera en empate, igual que la regla de mejor oferta', () => {
    const actions = ruleAgent.decide({
      limit: 1300,
      counterPct: 0,
      offers: [
        { name: 'Primera', price: 1000 },
        { name: 'Segunda', price: 1000 },
      ],
    });
    expect(actions).toContainEqual({ type: 'counter', supplier: 'Primera', price: 1000 });
  });
});
