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
  rewritten_text?: string;
  original_text?: string;
};

type GeneratedSegment = {
  theory_number: number;
  title: string;
  downloadUrl: string;
};

type JobState = {
  id: string;
  status: string;
  progress: number;
  message: string;
  theories: Theory[];
  theoryCount?: number;
  generatedSegments?: GeneratedSegment[];
  error?: { code: string; message: string };
};

const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || '';
const isConfiguredLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBase);
const isBrowserRemoteHost =
  typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = isConfiguredLocalhost && isBrowserRemoteHost ? '' : configuredApiBase;

export default function Dashboard() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingTheoryNumbers, setGeneratingTheoryNumbers] = useState<number[]>([]);

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
      if (data.status === 'ready' || data.status === 'failed') {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  const canStart = useMemo(() => !!videoFile && !submitting, [videoFile, submitting]);

  async function startProcessing() {
    setSubmitting(true);
    setError(null);
    setJob(null);
    setGeneratingTheoryNumbers([]);

    try {
      if (!videoFile) {
        setError('Please select an MP4 file');
        setSubmitting(false);
        return;
      }

      const payload = new FormData();
      payload.append('videoFile', videoFile);

      const response = await fetch(`${API_BASE}/api/process-video`, {
        method: 'POST',
        body: payload
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

  const generatedSegmentUrls = useMemo(() => {
    const entries = (job?.generatedSegments || []).map((segment) => {
      const url = API_BASE ? `${API_BASE}${segment.downloadUrl}` : segment.downloadUrl;
      return [Number(segment.theory_number), url] as const;
    });
    return Object.fromEntries(entries) as Record<number, string>;
  }, [job?.generatedSegments]);

  async function generateSegmentAudio(theoryNumber: number) {
    if (!jobId) return;

    setGeneratingTheoryNumbers((current) => (current.includes(theoryNumber) ? current : [...current, theoryNumber]));
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/job/${jobId}/generate-segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theoryNumber })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message || 'Unable to generate segment audio');
        return;
      }

      if (data?.job) {
        setJob(data.job);
      }
    } catch {
      setError('Network error while generating segment audio');
    } finally {
      setGeneratingTheoryNumbers((current) => current.filter((value) => value !== theoryNumber));
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
      <section className="rounded-2xl border border-white/15 bg-panel p-6 shadow-2xl backdrop-blur-soft">
        <h1 className="text-2xl font-semibold">Private MP4 Voiceover Studio</h1>
        <p className="mt-2 text-sm text-muted">Upload an MP4, detect theories, then generate only the segment audios you need.</p>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="file"
            accept="video/mp4,.mp4"
            onChange={(event) => {
              const selectedFile = event.target.files?.[0] || null;
              setVideoFile(selectedFile);
            }}
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
        </div>

        <SegmentList
          segments={job?.theories || []}
          onGenerateSegment={generateSegmentAudio}
          generatingTheoryNumbers={generatingTheoryNumbers}
          generatedSegmentUrls={generatedSegmentUrls}
        />
      </section>
    </main>
  );
}
