import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

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

export async function extractAudio({ inputVideoPath, outputAudioPath }) {
  await runCommand('ffmpeg', ['-y', '-i', inputVideoPath, '-ac', '1', '-ar', '44100', '-vn', outputAudioPath], 'FFMPEG_EXTRACT_FAILED');
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
