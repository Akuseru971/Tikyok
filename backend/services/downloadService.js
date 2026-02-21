import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

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
      reject(Object.assign(new Error(`yt-dlp failed (${code}): ${stderr || 'Unknown error'}`), { code: errorCode }));
    });
  });
}

export async function downloadYoutubeVideo({ youtubeUrl, outputPath }) {
  let cookiesFilePath = process.env.YTDLP_COOKIES_FILE?.trim();
  const cookiesContent = process.env.YTDLP_COOKIES?.trim();
  const jsRuntimePath = process.execPath;
  let tempCookiesPath = null;

  if (!cookiesFilePath && cookiesContent) {
    tempCookiesPath = path.join(os.tmpdir(), `tikyok-ytdlp-cookies-${Date.now()}.txt`);
    await fs.writeFile(tempCookiesPath, cookiesContent, 'utf-8');
    cookiesFilePath = tempCookiesPath;
  }

  const args = [
    '--no-playlist',
    '--js-runtimes',
    `node:${jsRuntimePath}`,
    '--extractor-args',
    'youtube:player_client=android,web',
    '-f',
    'bestvideo+bestaudio/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outputPath
  ];

  if (cookiesFilePath) {
    args.push('--cookies', cookiesFilePath);
  }

  args.push(youtubeUrl);

  try {
    await runCommand('yt-dlp', args, 'YTDLP_FAILED');
  } catch (error) {
    const message = String(error?.message || 'Unknown yt-dlp error');
    const needsCookies = /sign in to confirm you[’']?re not a bot/i.test(message);

    if (needsCookies && !cookiesFilePath) {
      throw Object.assign(
        new Error('yt-dlp blocked by YouTube bot check. Set YTDLP_COOKIES_FILE on backend or upload a local video file instead of YouTube URL.'),
        { code: 'YTDLP_COOKIES_REQUIRED' }
      );
    }

    throw error;
  } finally {
    if (tempCookiesPath) {
      await fs.rm(tempCookiesPath, { force: true });
    }
  }
}
