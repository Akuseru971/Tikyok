import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createJobDir, getJobPath, writeJson, copyFile } from '../utils/fileManager.js';
import { extractAudio, extractAudioSegment } from '../services/ffmpegService.js';
import { transcribeAudio } from '../services/transcriptionService.js';
import { detectTheories } from '../services/segmentationService.js';
import { rewriteTheorySegment } from '../services/rewriteService.js';
import { generateVoiceChangedSegment } from '../services/elevenService.js';

const upload = multer({ dest: '/tmp/tikyok-uploads' });

const STEP_PROGRESS = {
  downloading: 10,
  transcribing: 30,
  detecting: 45,
  rewriting: 60,
  ready: 100
};

function setJob(jobs, jobId, patch) {
  const current = jobs.get(jobId) || {};
  jobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

function parseFloatSafe(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function processJob({ jobs, jobId, uploadedFilePath }) {
  const jobDir = await createJobDir(jobId);
  const originalVideoPath = getJobPath(jobId, 'original.mp4');
  const audioPath = getJobPath(jobId, 'audio.mp3');
  const transcriptPath = getJobPath(jobId, 'transcript.json');
  const theoriesPath = getJobPath(jobId, 'theories.json');
  const rewrittenPath = getJobPath(jobId, 'rewritten_segments.json');

  try {
    if (uploadedFilePath) {
      setJob(jobs, jobId, { status: 'downloading', progress: STEP_PROGRESS.downloading, message: 'Using uploaded video fallback...' });
      await copyFile(uploadedFilePath, originalVideoPath);
      await fs.rm(uploadedFilePath, { force: true });
    } else {
      throw new Error('No MP4 file provided');
    }

    setJob(jobs, jobId, { status: 'transcribing', progress: STEP_PROGRESS.transcribing, message: 'Extracting and transcribing audio...' });
    await extractAudio({ inputVideoPath: originalVideoPath, outputAudioPath: audioPath });
    const transcript = await transcribeAudio({ audioPath });
    await writeJson(transcriptPath, transcript);

    setJob(jobs, jobId, { status: 'detecting', progress: STEP_PROGRESS.detecting, message: 'Detecting distinct theories/topics...' });
    const theories = await detectTheories({ transcript });
    await writeJson(theoriesPath, theories);

    const rewrittenSegments = [];
    setJob(jobs, jobId, {
      status: 'rewriting',
      progress: STEP_PROGRESS.rewriting,
      message: 'Rewriting segments faithfully...',
      theories
    });

    for (let index = 0; index < theories.length; index += 1) {
      const theory = theories[index];
      const segmentText = transcript.segments
        .filter((segment) => segment.start >= parseFloatSafe(theory.start_time) && segment.end <= parseFloatSafe(theory.end_time))
        .map((segment) => segment.text)
        .join(' ')
        .trim();

      const rewrittenText = await rewriteTheorySegment({ theory, originalText: segmentText });
      rewrittenSegments.push({ ...theory, rewritten_text: rewrittenText, original_text: segmentText });

      const segmentProgress = STEP_PROGRESS.rewriting + Math.floor(((index + 1) / Math.max(theories.length, 1)) * 15);
      setJob(jobs, jobId, {
        status: 'rewriting',
        progress: Math.min(segmentProgress, 75),
        message: `Rewritten segment ${index + 1}/${theories.length}`,
        theories: rewrittenSegments
      });
    }

    await writeJson(rewrittenPath, rewrittenSegments);

    setJob(jobs, jobId, {
      status: 'ready',
      progress: STEP_PROGRESS.ready,
      message: 'Theories are ready. Run voice changer for any segment.',
      theories: rewrittenSegments,
      theoryCount: rewrittenSegments.length,
      generatedSegments: []
    });
  } catch (error) {
    console.error(`[Job ${jobId}]`, error);
    setJob(jobs, jobId, {
      status: 'failed',
      progress: 0,
      message: error.message || 'Processing failed',
      error: {
        code: error.code || 'PROCESSING_FAILED',
        message: error.message || 'Unknown processing error'
      }
    });
  }
}

export default function processVideoRouter({ jobs }) {
  const router = express.Router();

  router.post('/process-video', upload.single('videoFile'), async (req, res) => {
    const uploadedFilePath = req.file?.path;
    const mimeType = req.file?.mimetype || '';
    const originalName = (req.file?.originalname || '').toLowerCase();

    if (!uploadedFilePath) {
      return res.status(400).json({
        error: {
          code: 'MISSING_VIDEO_FILE',
          message: 'Provide a videoFile (MP4)'
        }
      });
    }

    const isMp4 = mimeType === 'video/mp4' || originalName.endsWith('.mp4');
    if (!isMp4) {
      return res.status(400).json({
        error: {
          code: 'INVALID_VIDEO_FORMAT',
          message: 'Only MP4 files are supported'
        }
      });
    }

    const jobId = uuidv4();
    setJob(jobs, jobId, {
      id: jobId,
      status: 'queued',
      progress: 0,
      message: 'Job queued',
      createdAt: new Date().toISOString(),
      theories: []
    });

    processJob({ jobs, jobId, uploadedFilePath }).catch((error) => {
      console.error('[ProcessJobUnhandled]', error);
    });

    return res.status(202).json({ jobId, status: 'queued' });
  });

  router.get('/job/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job ID not found'
        }
      });
    }
    return res.json(job);
  });

  router.post('/job/:jobId/generate-segment', express.json({ limit: '1mb' }), async (req, res) => {
    const jobId = req.params.jobId;
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job ID not found'
        }
      });
    }

    const theoryNumber = Number(req.body?.theoryNumber);
    if (!Number.isInteger(theoryNumber) || theoryNumber < 1) {
      return res.status(400).json({
        error: {
          code: 'INVALID_THEORY_NUMBER',
          message: 'Provide a valid theoryNumber'
        }
      });
    }

    const targetTheory = (job.theories || []).find((theory) => Number(theory.theory_number) === theoryNumber);
    if (!targetTheory) {
      return res.status(404).json({
        error: {
          code: 'THEORY_NOT_FOUND',
          message: 'Theory not found for this job'
        }
      });
    }

    const segmentStart = parseFloatSafe(targetTheory.start_time);
    const segmentEnd = parseFloatSafe(targetTheory.end_time);
    const segmentDuration = Math.max(segmentEnd - segmentStart, 0.1);
    if (segmentDuration <= 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SEGMENT_RANGE',
          message: 'Invalid theory timing range'
        }
      });
    }

    try {
      const jobDir = await createJobDir(jobId);
      const segmentAudioDir = path.join(jobDir, 'segments_audio');
      await fs.mkdir(segmentAudioDir, { recursive: true });

      const originalVideoPath = getJobPath(jobId, 'original.mp4');
      const sourceSegmentPath = path.join(segmentAudioDir, `segment_${theoryNumber}_source.wav`);
      const localOutputPath = path.join(segmentAudioDir, `segment_${theoryNumber}_voice_changed.mp3`);

      await extractAudioSegment({
        inputVideoPath: originalVideoPath,
        outputAudioPath: sourceSegmentPath,
        startTime: segmentStart,
        duration: segmentDuration
      });

      await generateVoiceChangedSegment({ inputAudioPath: sourceSegmentPath, outputPath: localOutputPath });

      const downloadDir = path.join(process.cwd(), 'public', 'downloads');
      await fs.mkdir(downloadDir, { recursive: true });
      const publicFilename = `${jobId}_segment_${theoryNumber}.mp3`;
      const publicOutputPath = path.join(downloadDir, publicFilename);
      await fs.copyFile(localOutputPath, publicOutputPath);

      const generatedSegment = {
        theory_number: theoryNumber,
        title: targetTheory.title,
        downloadUrl: `/downloads/${publicFilename}`
      };

      const previousGenerated = Array.isArray(job.generatedSegments) ? job.generatedSegments : [];
      const mergedGenerated = [
        ...previousGenerated.filter((item) => Number(item.theory_number) !== theoryNumber),
        generatedSegment
      ].sort((a, b) => Number(a.theory_number) - Number(b.theory_number));

      setJob(jobs, jobId, {
        status: 'ready',
        progress: STEP_PROGRESS.ready,
        message: `Voice-changed segment generated for theory ${theoryNumber}`,
        generatedSegments: mergedGenerated
      });

      return res.json({ ok: true, segment: generatedSegment, job: jobs.get(jobId) });
    } catch (error) {
      return res.status(500).json({
        error: {
          code: error.code || 'SEGMENT_GENERATION_FAILED',
          message: error.message || 'Segment voice generation failed'
        }
      });
    }
  });

  return router;
}
