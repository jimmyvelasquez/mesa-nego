import type { PurchaseCase } from '../lib/types';

/** Casos ficticios de demostración. En producción vendrán de la base de datos. */
export const CASES: PurchaseCase[] = [
  {
    key: 'pp',
    name: 'Polipropileno',
    buyer: 'Fabricante de envases ficticio (Buyer A)',
    unit: '€/t',
    volume: 40,
    baseline: 1250,
    limit: 1300,
    counterPct: 0.015,
    suppliers: [
      { name: 'Polímeros Norte', price: 1240 },
      { name: 'Resinas Sur', price: 1205 },
      { name: 'Granulados Este', price: 1330 },
    ],
  },
  {
    key: 'pallet',
    name: 'Transporte de palés',
    buyer: 'Distribuidor ficticio (Buyer B)',
    unit: '€/viaje',
    volume: 120,
    baseline: 310,
    limit: 295,
    counterPct: 0.02,
    suppliers: [
      { name: 'Logística Río', price: 298 },
      { name: 'Transportes Monte', price: 286 },
      { name: 'Carga Directa', price: 322 },
    ],
  },
  {
    key: 'crm',
    name: 'Licencias CRM',
    buyer: 'Empresa de servicios ficticia (Buyer C)',
    unit: '€/usuario/año',
    volume: 50,
    baseline: 420,
    limit: 390,
    counterPct: 0.01,
    suppliers: [
      { name: 'CloudSales', price: 395 },
      { name: 'ClientBase Pro', price: 372 },
      { name: 'Pipeline One', price: 430 },
    ],
  },
];
