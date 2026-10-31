import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// null: the line is not a run record, whether or not it is valid JSON.
function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  return {
    at,
    time,
    job,
    status,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' ? error : null,
  };
}

function toRow(job: string, lines: RunLine[]): DigestRow {
  const sorted = [...lines].sort((a, b) => a.time - b.time);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const count = (status: RunStatus) => sorted.filter((l) => l.status === status).length;
  return {
    job,
    owner: sorted.findLast((l) => l.owner !== null)?.owner ?? null,
    runs: sorted.length,
    ok: count('ok'),
    retries: count('retry'),
    fail: count('fail'),
    lastStatus: last.status,
    lastError: sorted.findLast((l) => l.error !== null)?.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
}

function digest(text: string): NightDigest {
  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const parsed = parseLine(line);
    if (parsed === null) {
      badLines += 1;
      continue;
    }
    byJob.set(parsed.job, [...(byJob.get(parsed.job) ?? []), parsed]);
  }
  const rows = [...byJob.entries()]
    .map(([job, lines]) => toRow(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return digest(text);
};
