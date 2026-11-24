import { useEffect, useRef } from 'react';
import type { AuditEntry } from '../lib/negotiation';

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length]);

  return (
    <div className="log" ref={ref}>
      {entries.length === 0 ? (
        <div>Sin eventos todavía.</div>
      ) : (
        entries.map((e, i) => (
          <div key={i}>
            {time(e.at)}  {e.message}
          </div>
        ))
      )}
    </div>
  );
}
