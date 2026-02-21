'use client';

import { useEffect, useMemo, useState } from 'react';
import ProgressBar from './ProgressBar';
import SegmentList from './SegmentList';

type Theory = {
  theory_number: number;
  title: string;
  start_time: number;
  end_time: number;
  description: string;
};

type JobState = {
  id: string;
  status: string;
  progress: number;
  message: string;
  theories: Theory[];
  theoryCount?: number;
  downloadUrl?: string;
  error?: { code: string; message: string };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export default function Dashboard() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      const response = await fetch(`${API_BASE}/api/job/${jobId}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message || 'Unable to fetch job status');
        return;
      }

      setJob(data);
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  const canStart = useMemo(() => !!youtubeUrl.trim() && !submitting, [youtubeUrl, submitting]);

  async function startProcessing() {
    setSubmitting(true);
    setError(null);
    setJob(null);

    try {
      const response = await fetch(`${API_BASE}/api/process-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message || 'Processing failed to start');
        setSubmitting(false);
        return;
      }

      setJobId(data.jobId);
    } catch {
      setError('Network error while starting the job');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
      <section className="rounded-2xl border border-white/15 bg-panel p-6 shadow-2xl backdrop-blur-soft">
        <h1 className="text-2xl font-semibold">Private YouTube Voiceover Studio</h1>
        <p className="mt-2 text-sm text-muted">Paste a YouTube URL and generate a faithful ElevenLabs voice-replaced MP4.</p>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="url"
            placeholder="https://youtube.com/..."
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-text placeholder:text-muted"
          />
          <button
            type="button"
            onClick={startProcessing}
            disabled={!canStart}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Starting...' : 'Process video'}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </section>

      <section className="mt-6 grid gap-6">
        <ProgressBar progress={job?.progress ?? 0} status={job?.status ?? 'queued'} />

        <div className="rounded-xl border border-white/10 bg-panel p-4 backdrop-blur-soft">
          <p className="text-sm text-muted">Current step</p>
          <p className="mt-1 text-sm font-medium">{job?.message || 'Waiting for input...'}</p>
          {job?.error ? <p className="mt-2 text-sm text-red-300">{job.error.code}: {job.error.message}</p> : null}
          <p className="mt-2 text-xs text-muted">Detected theory count: {job?.theoryCount ?? job?.theories?.length ?? 0}</p>

          {job?.downloadUrl && job.status === 'completed' ? (
            <a
              href={`${API_BASE}${job.downloadUrl}`}
              className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
              target="_blank"
              rel="noreferrer"
            >
              Download final MP4
            </a>
          ) : null}
        </div>

        <SegmentList segments={job?.theories || []} />
      </section>
    </main>
  );
}
