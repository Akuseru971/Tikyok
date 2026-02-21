import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createJobDir, getJobPath, writeJson, copyFile } from '../utils/fileManager.js';
import { extractAudio, buildTimelineAudio, replaceVideoAudio } from '../services/ffmpegService.js';
import { transcribeAudio } from '../services/transcriptionService.js';
import { detectTheories } from '../services/segmentationService.js';
import { rewriteTheorySegment } from '../services/rewriteService.js';
import { generateVoiceoverSegment } from '../services/elevenService.js';

const upload = multer({ dest: '/tmp/tikyok-uploads' });

const STEP_PROGRESS = {
  downloading: 10,
  transcribing: 30,
  detecting: 45,
  rewriting: 60,
  generating_voice: 80,
  rendering: 95,
  completed: 100
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
  const audioPath = getJobPath(jobId, 'audio.wav');
  const transcriptPath = getJobPath(jobId, 'transcript.json');
  const theoriesPath = getJobPath(jobId, 'theories.json');
  const rewrittenPath = getJobPath(jobId, 'rewritten_segments.json');
  const finalAudioPath = getJobPath(jobId, 'final_audio.wav');
  const finalVideoPath = getJobPath(jobId, 'final_output.mp4');
  const segmentsAudioDir = path.join(jobDir, 'segments_audio');

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

    setJob(jobs, jobId, { status: 'generating_voice', progress: STEP_PROGRESS.generating_voice, message: 'Generating ElevenLabs voiceovers...' });
    await fs.mkdir(segmentsAudioDir, { recursive: true });

    const generatedAudioSegments = [];
    for (let index = 0; index < rewrittenSegments.length; index += 1) {
      const segment = rewrittenSegments[index];
      const outputFile = path.join(segmentsAudioDir, `segment_${index + 1}.mp3`);
      await generateVoiceoverSegment({ text: segment.rewritten_text, outputPath: outputFile });
      generatedAudioSegments.push({
        start_time: parseFloatSafe(segment.start_time),
        end_time: parseFloatSafe(segment.end_time),
        filePath: outputFile,
        title: segment.title
      });

      const voiceProgress = STEP_PROGRESS.generating_voice + Math.floor(((index + 1) / Math.max(rewrittenSegments.length, 1)) * 10);
      setJob(jobs, jobId, {
        status: 'generating_voice',
        progress: Math.min(voiceProgress, 90),
        message: `Generated voice segment ${index + 1}/${rewrittenSegments.length}`
      });
    }

    setJob(jobs, jobId, { status: 'rendering', progress: STEP_PROGRESS.rendering, message: 'Rendering final audio and video...' });
    await buildTimelineAudio({ segments: generatedAudioSegments, outputAudioPath: finalAudioPath, jobDir });
    await replaceVideoAudio({ inputVideoPath: originalVideoPath, inputAudioPath: finalAudioPath, outputVideoPath: finalVideoPath });

    const downloadDir = path.join(process.cwd(), 'public', 'downloads');
    await fs.mkdir(downloadDir, { recursive: true });
    const finalPublicPath = path.join(downloadDir, `${jobId}.mp4`);
    await fs.copyFile(finalVideoPath, finalPublicPath);

    setJob(jobs, jobId, {
      status: 'completed',
      progress: STEP_PROGRESS.completed,
      message: 'Final MP4 ready for subtitle insertion',
      downloadUrl: `/downloads/${jobId}.mp4`,
      theories: rewrittenSegments,
      theoryCount: rewrittenSegments.length
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

  return router;
}
