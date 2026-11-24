interface Props {
  steps: readonly string[];
  current: number;
}

export function Stepper({ steps, current }: Props) {
  return (
    <div className="stepper">
      {steps.map((title, i) => {
        const cls = i < current ? 'done' : i === current ? 'current' : '';
        return (
          <div key={title} className={`step ${cls}`}>
            <b>
              {i + 1}. {title}
            </b>
          </div>
        );
      })}
    </div>
  );
}
