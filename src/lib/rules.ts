import type { Evaluation, Offer } from './types';

/**
 * Marca cada oferta como dentro o fuera del límite del comprador.
 * Un precio igual al límite se considera dentro.
 */
export function evaluateOffers(offers: Offer[], limit: number): Evaluation[] {
  return offers.map((o) => ({ ...o, within: o.price <= limit }));
}

/**
 * Devuelve la oferta más barata dentro del límite, o undefined si ninguna cumple.
 * En caso de empate, gana la primera en el orden de entrada.
 */
export function bestWithinLimit(evaluations: Evaluation[]): Evaluation | undefined {
  return evaluations
    .filter((e) => e.within)
    .reduce<Evaluation | undefined>((best, e) => (best === undefined || e.price < best.price ? e : best), undefined);
}

/**
 * Contraoferta: aplica una mejora porcentual al precio, redondeada al entero.
 *
 * - Nunca sube el precio: el resultado nunca supera `price`.
 * - Nunca baja de `floor` (suelo que fija el comprador o el proveedor), si se indica.
 * - Nunca devuelve un valor negativo.
 */
export function counterOffer(price: number, pct: number, floor = 0): number {
  const improved = Math.round(price * (1 - pct));
  const bounded = Math.max(floor, improved, 0);
  return Math.min(bounded, price);
}

/** Ahorro relativo frente al precio de referencia (0 si no hay ahorro). */
export function savingsVsBaseline(baseline: number, final: number): number {
  if (baseline <= 0) return 0;
  return 1 - final / baseline;
}
