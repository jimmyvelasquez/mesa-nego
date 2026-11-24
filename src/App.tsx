import { useReducer, useState } from 'react';
import { CASES } from './data/cases';
import { STEPS, initialState, reducer } from './lib/negotiation';
import type { PurchaseCase } from './lib/types';
import { now } from './lib/time';
import { AuditLog } from './components/AuditLog';
import { CaseSelector } from './components/CaseSelector';
import { Stepper } from './components/Stepper';
import { StepView } from './components/StepView';

export default function App() {
  const [caseData, setCaseData] = useState<PurchaseCase>(CASES[0]);
  const [flow, dispatch] = useReducer(reducer, CASES[0], (c) => initialState(c, now()));

  const selectCase = (c: PurchaseCase) => {
    setCaseData(c);
    dispatch({ type: 'selectCase', caseData: c, at: now() });
  };

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Mesa Nego</h1>
          <small>Demo de negociación asistida por agente · datos ficticios · ERP simulado</small>
        </div>
        <CaseSelector cases={CASES} activeKey={caseData.key} onSelect={selectCase} />
      </header>

      <main>
        <section className="card">
          <Stepper steps={STEPS} current={flow.step} />
        </section>

        <section className="card">
          <StepView caseData={caseData} flow={flow} dispatch={dispatch} />
        </section>

        <section className="card">
          <h2>Registro de auditoría</h2>
          <AuditLog entries={flow.audit} />
          <p className="note">Registro de solo escritura. Cada acción del agente y de las personas queda anotada.</p>
        </section>
      </main>
    </>
  );
}
