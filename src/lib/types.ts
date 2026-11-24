export interface Supplier {
  name: string;
  price: number;
}

export interface PurchaseCase {
  key: string;
  name: string;
  buyer: string;
  unit: string;
  volume: number;
  /** Precio de referencia (sin negociar). */
  baseline: number;
  /** Precio máximo que el comprador acepta. */
  limit: number;
  /** Porcentaje de mejora que pide el agente en su contraoferta (0-1). */
  counterPct: number;
  suppliers: Supplier[];
}

export interface Offer {
  name: string;
  price: number;
}

export interface Evaluation extends Offer {
  within: boolean;
}
