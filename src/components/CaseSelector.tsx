import type { PurchaseCase } from '../lib/types';

interface Props {
  cases: PurchaseCase[];
  activeKey: string;
  onSelect: (c: PurchaseCase) => void;
}

export function CaseSelector({ cases, activeKey, onSelect }: Props) {
  return (
    <div className="cases">
      {cases.map((c) => (
        <button key={c.key} className={c.key === activeKey ? 'active' : ''} onClick={() => onSelect(c)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
