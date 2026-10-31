import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightCounts[];
};

// Line counts for one night; null counts mean the night could not be read.
export type NightCounts = { night: string; ok: number | null; retries: number | null; fail: number | null };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function countNight(config: RigConfig, night: string): NightCounts {
  try {
    const digest = readNight(config.runsDir, night);
    if (digest === null) return { night, ok: null, retries: null, fail: null };
    return {
      night,
      ok: digest.rows.reduce((n, r) => n + r.ok, 0),
      retries: digest.rows.reduce((n, r) => n + r.retries, 0),
      fail: digest.rows.reduce((n, r) => n + r.fail, 0),
    };
  } catch {
    return { night, ok: null, retries: null, fail: null };
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => countNight(config, n)),
  };
}
