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
      reject(Object.assign(new Error(`yt-dlp failed (${code}): ${stderr || 'Unknown error'}`), { code: errorCode }));
    });
  });
}

export async function downloadYoutubeVideo({ youtubeUrl, outputPath }) {
  const args = [
    '--no-playlist',
    '-f',
    'bestvideo+bestaudio/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outputPath,
    youtubeUrl
  ];

  await runCommand('yt-dlp', args, 'YTDLP_FAILED');
}
