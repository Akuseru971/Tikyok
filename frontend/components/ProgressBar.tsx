type StepKey =
  | 'downloading'
  | 'transcribing'
  | 'detecting'
  | 'rewriting'
  | 'ready';

type ProgressBarProps = {
  progress: number;
  status: string;
};

const steps: { key: StepKey; label: string }[] = [
  { key: 'downloading', label: 'Downloading' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'detecting', label: 'Detecting theories' },
  { key: 'rewriting', label: 'Rewriting' },
  { key: 'ready', label: 'Ready to generate' }
];

const statusOrder: StepKey[] = ['downloading', 'transcribing', 'detecting', 'rewriting', 'ready'];

export default function ProgressBar({ progress, status }: ProgressBarProps) {
  const currentIndex = Math.max(statusOrder.indexOf(status as StepKey), 0);

  return (
    <div className="rounded-xl border border-white/10 bg-panel p-4 backdrop-blur-soft">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">Processing status</p>
        <p className="text-sm font-semibold text-accent">{progress}%</p>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        {steps.map((step, index) => {
          const active = index <= currentIndex;
          return (
            <div key={step.key} className={`rounded-lg border px-3 py-2 text-xs ${active ? 'border-accent/70 bg-accent/10 text-text' : 'border-white/10 text-muted'}`}>
              {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
