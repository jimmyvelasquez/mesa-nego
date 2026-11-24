import { bestWithinLimit, counterOffer, evaluateOffers } from './rules';
import type { Offer } from './types';

/**
 * Acciones que el agente puede proponer. El agente nunca adjudica ni cambia reglas:
 * una adjudicación siempre es una propuesta que requiere aprobación humana.
 */
export type AgentAction =
  | { type: 'counter'; supplier: string; price: number }
  | { type: 'escalate'; supplier: string; reason: 'outside_limit' }
  | { type: 'propose_award'; supplier: string; price: number; requiresHumanApproval: true };

export interface AgentInput {
  offers: Offer[];
  /** Precio máximo que acepta el comprador. */
  limit: number;
  /** Mejora porcentual que pide el agente (0-1). */
  counterPct: number;
  /** Suelo opcional por debajo del cual no se negocia. */
  floor?: number;
}

/** Contrato del motor de negociación. Cualquier implementación debe cumplirlo. */
export interface NegotiationAgent {
  decide(input: AgentInput): AgentAction[];
}

/**
 * Agente basado en reglas (sin IA). Sirve de referencia y de línea base
 * para comparar con un motor más avanzado en fases posteriores.
 */
export const ruleAgent: NegotiationAgent = {
  decide({ offers, limit, counterPct, floor }) {
    if (offers.length === 0) return [];

    const evaluations = evaluateOffers(offers, limit);
    const actions: AgentAction[] = [];

    for (const e of evaluations) {
      if (!e.within) actions.push({ type: 'escalate', supplier: e.name, reason: 'outside_limit' });
    }

    const best = bestWithinLimit(evaluations);
    if (best === undefined) return actions;

    const price = counterOffer(best.price, counterPct, floor);
    actions.push({ type: 'counter', supplier: best.name, price });
    actions.push({ type: 'propose_award', supplier: best.name, price, requiresHumanApproval: true });
    return actions;
  },
};
