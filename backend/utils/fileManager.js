import fs from 'fs/promises';
import path from 'path';

const TMP_ROOT = process.env.TMP_ROOT || '/tmp/tikyok-jobs';

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function createJobDir(jobId) {
  const jobDir = path.join(TMP_ROOT, jobId);
  await ensureDir(jobDir);
  return jobDir;
}

export function getJobPath(jobId, fileName) {
  return path.join(TMP_ROOT, jobId, fileName);
}

export async function cleanupJobDir(jobId) {
  const jobDir = path.join(TMP_ROOT, jobId);
  await fs.rm(jobDir, { recursive: true, force: true });
}

export async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function copyFile(source, destination) {
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
}
