import { CheckerSpinner } from "./checker-spinner";

export type StepState = "pending" | "active" | "success" | "error";

export type CheckerStep = {
  id: string;
  label: string;
  description: string;
  state: StepState;
  detail?: string;
};

export function CheckerProgress({ steps }: { steps: CheckerStep[] }) {
  return (
    <ol className="space-y-3" aria-live="polite">
      {steps.map((step, idx) => (
        <li key={step.id}>
          <CheckerProgressItem step={step} index={idx} />
        </li>
      ))}
    </ol>
  );
}

function CheckerProgressItem({
  step,
  index,
}: {
  step: CheckerStep;
  index: number;
}) {
  const tone =
    step.state === "pending"
      ? "border-zinc-200 bg-zinc-50/60"
      : step.state === "active"
        ? "border-zinc-900 bg-white shadow-[0_0_0_4px_rgba(0,0,0,0.04)]"
        : step.state === "success"
          ? "border-emerald-400/60 bg-emerald-50/50"
          : "border-rose-400/60 bg-rose-50/50";

  const titleTone =
    step.state === "pending" ? "text-zinc-500" : "text-zinc-900";
  const descTone =
    step.state === "pending" ? "text-zinc-400" : "text-zinc-600";

  return (
    <div
      className={`flex items-start gap-4 rounded-xl border p-4 transition-all duration-300 ${tone}`}
    >
      <StepIcon state={step.state} number={index + 1} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${titleTone}`}>{step.label}</div>
        <div className={`mt-0.5 text-xs ${descTone}`}>{step.description}</div>
        {step.detail && (
          <div
            className={`mt-2 text-xs font-medium ${
              step.state === "error" ? "text-rose-700" : "text-zinc-700"
            }`}
          >
            {step.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function StepIcon({ state, number }: { state: StepState; number: number }) {
  if (state === "active") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-900">
        <CheckerSpinner size={32} />
      </div>
    );
  }
  if (state === "success") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-xs font-medium text-zinc-400">
      {number}
    </div>
  );
}
