import type { Evaluation, PurchaseCase } from './types';
import { bestWithinLimit, counterOffer, evaluateOffers, savingsVsBaseline } from './rules';

/**
 * Pasos del flujo (índice = valor de `step`):
 * 0 definir · 1 invitar · 2 ofertas · 3 evaluar · 4 negociar ·
 * 5 revisión humana · 6 adjudicar · 7 ERP · 8 auditoría final
 */
export const STEPS = [
  'Definir compra',
  'Invitar proveedores',
  'Recoger ofertas',
  'Evaluar con reglas',
  'Negociar',
  'Revisión humana',
  'Adjudicar',
  'Enviar a ERP',
  'Auditoría final',
] as const;

export interface AuditEntry {
  at: string;
  message: string;
}

export interface NegotiationState {
  caseKey: string;
  step: number;
  invited: number[];
  /** Ofertas evaluadas; null hasta ejecutar la evaluación. */
  evaluation: Evaluation[] | null;
  /** Contraoferta final del agente; null hasta ejecutar la ronda. */
  counterFinal: number | null;
  approved: boolean;
  erpId: string | null;
  audit: AuditEntry[];
}

export type Action =
  | { type: 'selectCase'; caseData: PurchaseCase; at: string }
  | { type: 'toggleInvite'; index: number }
  | { type: 'sendInvites'; caseData: PurchaseCase; at: string }
  | { type: 'evaluate'; caseData: PurchaseCase; at: string }
  | { type: 'negotiate'; caseData: PurchaseCase; at: string }
  | { type: 'setApproved'; value: boolean }
  | { type: 'advance'; at: string }
  | { type: 'sendToErp'; id: string; at: string }
  | { type: 'restart'; caseData: PurchaseCase; at: string };

export function initialState(caseData: PurchaseCase, at: string): NegotiationState {
  return {
    caseKey: caseData.key,
    step: 0,
    invited: [],
    evaluation: null,
    counterFinal: null,
    approved: false,
    erpId: null,
    audit: [{ at, message: `Caso iniciado: ${caseData.name} (${caseData.buyer})` }],
  };
}

function append(state: NegotiationState, entries: AuditEntry[]): AuditEntry[] {
  return [...state.audit, ...entries];
}

/** Reducer puro: toda la lógica de la demo pasa por aquí. */
export function reducer(state: NegotiationState, action: Action): NegotiationState {
  switch (action.type) {
    case 'selectCase':
    case 'restart':
      return initialState(action.caseData, action.at);

    case 'toggleInvite': {
      const invited = state.invited.includes(action.index)
        ? state.invited.filter((i) => i !== action.index)
        : [...state.invited, action.index];
      return { ...state, invited };
    }

    case 'sendInvites': {
      const names = state.invited.map((i) => action.caseData.suppliers[i].name);
      return {
        ...state,
        step: 2,
        audit: append(state, [
          { at: action.at, message: `Invitaciones enviadas a ${names.join(', ')}` },
          { at: action.at, message: `Ofertas recibidas: ${names.length}` },
        ]),
      };
    }

    case 'evaluate': {
      const offers = state.invited.map((i) => action.caseData.suppliers[i]);
      const evaluation = evaluateOffers(offers, action.caseData.limit);
      const inLimit = evaluation.filter((e) => e.within).length;
      const entries: AuditEntry[] = [
        { at: action.at, message: `Motor de reglas: ${inLimit} dentro de límite, ${evaluation.length - inLimit} fuera` },
        ...evaluation
          .filter((e) => !e.within)
          .map((e) => ({ at: action.at, message: `Oferta fuera de límite de ${e.name} marcada para revisión humana` })),
      ];
      return { ...state, evaluation, audit: append(state, entries) };
    }

    case 'negotiate': {
      const best = state.evaluation ? bestWithinLimit(state.evaluation) : undefined;
      if (best === undefined) return state;
      const counterFinal = counterOffer(best.price, action.caseData.counterPct);
      return {
        ...state,
        counterFinal,
        audit: append(state, [
          { at: action.at, message: `Agente contraoferta a ${best.name}: ${counterFinal} ${action.caseData.unit}` },
          { at: action.at, message: 'Agente cierra ronda con contraoferta dentro de límites' },
        ]),
      };
    }

    case 'setApproved':
      return { ...state, approved: action.value };

    case 'advance': {
      const entries: AuditEntry[] = [];
      if (state.step === 5) {
        const hasOutside = state.evaluation?.some((e) => !e.within) ?? false;
        if (hasOutside) {
          entries.push({
            at: action.at,
            message: state.approved
              ? 'Persona aprueba mantener ofertas fuera de límite como alternativa'
              : 'Revisión humana completada',
          });
        }
      }
      if (state.step === 6) {
        entries.push({ at: action.at, message: 'Adjudicación confirmada por persona' });
      }
      if (state.step === 7) {
        entries.push({ at: action.at, message: 'Proceso completado' });
      }
      return { ...state, step: state.step + 1, audit: append(state, entries) };
    }

    case 'sendToErp':
      return {
        ...state,
        erpId: action.id,
        audit: append(state, [{ at: action.at, message: `Pedido ${action.id} enviado al ERP (simulado)` }]),
      };
  }
}

/** Mejor oferta dentro de límite, o undefined si ninguna cumple. */
export function winner(state: NegotiationState): Evaluation | undefined {
  return state.evaluation ? bestWithinLimit(state.evaluation) : undefined;
}

/** Ahorro frente a referencia tras la ronda del agente (0 si aún no hay ronda). */
export function savings(caseData: PurchaseCase, state: NegotiationState): number {
  return state.counterFinal === null ? 0 : savingsVsBaseline(caseData.baseline, state.counterFinal);
}
