import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

function runsDirWith(night: string, text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(dir, `${night}.jsonl`), text);
  return dir;
}

describe('readNight on the 2026-10-28 log', () => {
  const night = readNight('runs', '2026-10-28')!;
  const row = (job: string) => night.rows.find((r) => r.job === job)!;

  it('finds 5 jobs and 1 bad line', () => {
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts retries and keeps the last error after a recovery', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      ok: 1,
      retries: 3,
      fail: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('does not count the bad line as a run', () => {
    expect(row('lane/sync').runs).toBe(8);
  });

  it('keeps a failed job', () => {
    expect(row('notes/backup')).toMatchObject({ fail: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render').owner).toBeNull();
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight(runsDirWith('2026-01-01', ''), '2026-01-02')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    expect(readNight(runsDirWith('2026-01-01', ''), '2026-01-01')).toEqual({ rows: [], badLines: 0 });
  });

  it.each([
    ['broken JSON', '{"at":'],
    ['JSON that is not an object', '42'],
    ['an unknown status', '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"maybe","owner":null}'],
    ['a time that does not parse', '{"at":"soon","job":"a","status":"ok","owner":null}'],
  ])('counts %s as a bad line', (_name, line) => {
    expect(readNight(runsDirWith('2026-01-01', line), '2026-01-01')).toEqual({ rows: [], badLines: 1 });
  });

  it('orders a job by time, not by file order', () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"retry","owner":"x","error":"e"}',
    ].join('\n');
    const row = readNight(runsDirWith('2026-01-01', lines), '2026-01-01')!.rows[0]!;
    expect(row).toMatchObject({
      lastStatus: 'ok',
      firstAt: '2026-01-01T23:00:00+01:00',
      lastAt: '2026-01-02T01:00:00+01:00',
    });
  });
});
