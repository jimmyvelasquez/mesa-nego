import { describe, expect, it } from 'vitest';
import { bestWithinLimit, counterOffer, evaluateOffers, savingsVsBaseline } from './rules';

describe('evaluateOffers', () => {
  it('marca ofertas dentro y fuera del límite', () => {
    const result = evaluateOffers(
      [
        { name: 'A', price: 1240 },
        { name: 'B', price: 1330 },
      ],
      1300,
    );
    expect(result.map((r) => r.within)).toEqual([true, false]);
  });

  it('considera dentro una oferta igual al límite', () => {
    const [r] = evaluateOffers([{ name: 'A', price: 1300 }], 1300);
    expect(r.within).toBe(true);
  });

  it('devuelve lista vacía si no hay ofertas', () => {
    expect(evaluateOffers([], 100)).toEqual([]);
  });
});

describe('bestWithinLimit', () => {
  it('elige la oferta más barata dentro del límite', () => {
    const best = bestWithinLimit(
      evaluateOffers(
        [
          { name: 'A', price: 1240 },
          { name: 'B', price: 1205 },
          { name: 'C', price: 1330 },
        ],
        1300,
      ),
    );
    expect(best?.name).toBe('B');
  });

  it('ignora ofertas fuera de límite aunque aparezcan primero', () => {
    const best = bestWithinLimit(
      evaluateOffers(
        [
          { name: 'Cara', price: 500 },
          { name: 'Media', price: 200 },
        ],
        300,
      ),
    );
    expect(best?.name).toBe('Media');
  });

  it('devuelve undefined si ninguna oferta cumple el límite', () => {
    expect(bestWithinLimit(evaluateOffers([{ name: 'A', price: 400 }], 300))).toBeUndefined();
  });

  it('en empate gana la primera oferta', () => {
    const best = bestWithinLimit(
      evaluateOffers(
        [
          { name: 'Primera', price: 300 },
          { name: 'Segunda', price: 300 },
        ],
        300,
      ),
    );
    expect(best?.name).toBe('Primera');
  });
});

describe('counterOffer', () => {
  it('aplica la mejora porcentual y redondea', () => {
    expect(counterOffer(1205, 0.015)).toBe(1187);
    expect(counterOffer(286, 0.02)).toBe(280);
  });

  it('no baja de cero', () => {
    expect(counterOffer(10, 5)).toBe(0);
  });

  it('sin mejora devuelve el mismo precio', () => {
    expect(counterOffer(1000, 0)).toBe(1000);
  });

  it('no baja del suelo indicado', () => {
    expect(counterOffer(300, 0.5, 250)).toBe(250);
  });

  it('no sube el precio aunque el suelo esté por encima', () => {
    expect(counterOffer(298, 0.02, 500)).toBe(298);
  });
});

describe('savingsVsBaseline', () => {
  it('calcula el ahorro relativo', () => {
    expect(savingsVsBaseline(1000, 900)).toBeCloseTo(0.1);
  });

  it('devuelve 0 si la referencia no es positiva', () => {
    expect(savingsVsBaseline(0, 50)).toBe(0);
  });

  it('puede ser negativo si el precio final sube', () => {
    expect(savingsVsBaseline(1000, 1100)).toBeCloseTo(-0.1);
  });
});
