type Segment = {
  theory_number: number;
  title: string;
  start_time: number;
  end_time: number;
  description: string;
};

type SegmentListProps = {
  segments: Segment[];
  onGenerateSegment: (theoryNumber: number) => void;
  generatingTheoryNumbers: number[];
  generatedSegmentUrls: Record<number, string>;
};

function formatDuration(seconds: number) {
  const safe = Math.max(seconds, 0);
  const minutes = Math.floor(safe / 60);
  const remaining = Math.floor(safe % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${remaining}`;
}

export default function SegmentList({ segments, onGenerateSegment, generatingTheoryNumbers, generatedSegmentUrls }: SegmentListProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-panel p-4 backdrop-blur-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Detected theories</h2>
        <span className="rounded-md bg-accent/20 px-2 py-1 text-xs text-accent">{segments.length} segments</span>
      </div>

      <div className="space-y-3">
        {segments.length === 0 ? (
          <p className="text-sm text-muted">No theories detected yet.</p>
        ) : (
          segments.map((segment) => (
            <article key={`${segment.theory_number}-${segment.start_time}`} className="rounded-lg border border-white/10 p-3">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-medium">{segment.theory_number}. {segment.title}</h3>
                <span className="text-xs text-muted">{formatDuration(segment.end_time - segment.start_time)}</span>
              </div>
              <p className="text-xs text-muted">{formatDuration(segment.start_time)} → {formatDuration(segment.end_time)}</p>
              <p className="mt-1 text-sm text-text/90">{segment.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onGenerateSegment(segment.theory_number)}
                  disabled={generatingTheoryNumbers.includes(segment.theory_number)}
                  className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingTheoryNumbers.includes(segment.theory_number) ? 'Generating...' : 'Generate segment audio'}
                </button>

                {generatedSegmentUrls[segment.theory_number] ? (
                  <a
                    href={generatedSegmentUrls[segment.theory_number]}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-white/20 px-3 py-1 text-xs"
                  >
                    Download segment MP3
                  </a>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
