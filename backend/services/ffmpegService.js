import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const DEFAULT_TRANSCRIPTION_MAX_BYTES = 24 * 1024 * 1024;

function runCommand(command, args, errorCode) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(Object.assign(new Error(err.message), { code: errorCode }));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(Object.assign(new Error(`FFmpeg failed (${code}): ${stderr || 'Unknown error'}`), { code: errorCode }));
    });
  });
}

function runCommandWithStdout(command, args, errorCode) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(Object.assign(new Error(err.message), { code: errorCode }));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(Object.assign(new Error(`Command failed (${code}): ${stderr || 'Unknown error'}`), { code: errorCode }));
    });
  });
}

async function getMediaDurationSeconds(filePath) {
  const output = await runCommandWithStdout(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', filePath],
    'FFPROBE_DURATION_FAILED'
  );

  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(new Error('Unable to read media duration'), { code: 'FFPROBE_DURATION_INVALID' });
  }
  return duration;
}

export async function extractAudio({ inputVideoPath, outputAudioPath, targetMaxBytes = DEFAULT_TRANSCRIPTION_MAX_BYTES }) {
  let bitrateKbps = 32;

  try {
    const durationSeconds = await getMediaDurationSeconds(inputVideoPath);
    const targetBitsPerSecond = Math.floor((targetMaxBytes * 8) / durationSeconds);
    bitrateKbps = Math.max(12, Math.min(64, Math.floor(targetBitsPerSecond / 1000)));
  } catch {
    bitrateKbps = 32;
  }

  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputVideoPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-vn',
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${bitrateKbps}k`,
      outputAudioPath
    ],
    'FFMPEG_EXTRACT_FAILED'
  );
}

export async function extractAudioSegment({ inputVideoPath, outputAudioPath, startTime, duration }) {
  const safeStart = Math.max(Number(startTime) || 0, 0);
  const safeDuration = Math.max(Number(duration) || 0.1, 0.1);

  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-ss',
      safeStart.toFixed(3),
      '-t',
      safeDuration.toFixed(3),
      '-i',
      inputVideoPath,
      '-ac',
      '1',
      '-ar',
      '44100',
      '-vn',
      '-c:a',
      'pcm_s16le',
      outputAudioPath
    ],
    'FFMPEG_EXTRACT_SEGMENT_FAILED'
  );
}

async function createSilence({ outputPath, duration }) {
  await runCommand(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(duration), '-c:a', 'pcm_s16le', outputPath],
    'FFMPEG_SILENCE_FAILED'
  );
}

async function normalizeToDuration({ inputPath, outputPath, duration }) {
  await runCommand(
    'ffmpeg',
    ['-y', '-i', inputPath, '-ac', '1', '-ar', '44100', '-af', `apad=pad_dur=${duration},atrim=end=${duration}`, '-c:a', 'pcm_s16le', outputPath],
    'FFMPEG_NORMALIZE_FAILED'
  );
}

export async function buildTimelineAudio({ segments, outputAudioPath, jobDir }) {
  if (!segments.length) {
    throw Object.assign(new Error('No generated audio segments to concatenate'), { code: 'EMPTY_SEGMENTS' });
  }

  const timelineDir = path.join(jobDir, 'timeline_parts');
  await fs.mkdir(timelineDir, { recursive: true });

  const filesInOrder = [];
  let cursor = 0;

  const ordered = [...segments].sort((a, b) => a.start_time - b.start_time);

  for (let index = 0; index < ordered.length; index += 1) {
    const segment = ordered[index];
    const startTime = Number(segment.start_time) || cursor;
    const endTime = Number(segment.end_time) || startTime;
    const plannedDuration = Math.max(endTime - startTime, 0.1);

    const gap = startTime - cursor;
    if (gap > 0.02) {
      const silencePath = path.join(timelineDir, `part_${index}_silence.wav`);
      await createSilence({ outputPath: silencePath, duration: gap });
      filesInOrder.push(silencePath);
    }

    const normalizedSegmentPath = path.join(timelineDir, `part_${index}_voice.wav`);
    await normalizeToDuration({ inputPath: segment.filePath, outputPath: normalizedSegmentPath, duration: plannedDuration });
    filesInOrder.push(normalizedSegmentPath);

    cursor = endTime;
  }

  const concatListPath = path.join(timelineDir, 'concat_list.txt');
  const concatContent = filesInOrder.map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(concatListPath, concatContent, 'utf-8');

  await runCommand('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', outputAudioPath], 'FFMPEG_CONCAT_FAILED');
}

export async function replaceVideoAudio({ inputVideoPath, inputAudioPath, outputVideoPath }) {
  await runCommand(
    'ffmpeg',
    ['-y', '-i', inputVideoPath, '-i', inputAudioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-shortest', outputVideoPath],
    'FFMPEG_REPLACE_AUDIO_FAILED'
  );
}
