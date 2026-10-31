import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, NightDigest, RunStatus } from '../src/digest/types.js';

type DigestJson = NightDigest & { night: string };

const NIGHT = '2026-10-28';
const MISSING_NIGHT = '2026-01-02';
const EMPTY_NIGHT = '2026-01-03';
const BAD_NIGHT = '2026-01-04';

const JOBS_SORTED = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'];

const run = (at: string, job: string, status: RunStatus, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

// Lines are deliberately out of job order in the file.
const NIGHT_LINES = [
  run('2026-10-29T01:00:00+01:00', 'lane/sync', 'ok', 'rook'),
  run('2026-10-29T01:10:00+01:00', 'notes/backup', 'ok', 'mira'),
  run('2026-10-29T01:30:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  run('2026-10-29T02:20:00+01:00', 'digest/render', 'ok', null),
  run('2026-10-29T01:33:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  run('2026-10-29T03:00:00+01:00', 'notes/backup', 'fail', 'mira', 'quota exceeded'),
  run('2026-10-29T01:35:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  run('2026-10-29T02:00:00+01:00', 'lane/sync', 'ok', 'rook'),
  run('2026-10-29T01:37:00+01:00', 'fixtures/refresh', 'ok', 'rook'),
];

let runsDir: string;

function writeNight(night: string, text: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), text);
}

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

// The <tr> element whose text mentions this job.
function rowFor(html: string, job: string): string {
  const row = (html.match(/<tr[\s\S]*?<\/tr>/g) ?? []).find((tr) => tr.includes(job));
  if (row === undefined) throw new Error(`no table row for ${job}`);
  return row;
}

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeNight(NIGHT, NIGHT_LINES.join('\n'));
  writeNight(EMPTY_NIGHT, '');
  writeNight(BAD_NIGHT, [NIGHT_LINES[0], 'this is not json', NIGHT_LINES[1]].join('\n'));
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/<night>', () => {
  it('answers 200 with the rig banner', async () => {
    const res = await app().request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
  });

  it('lists every job in sorted order', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    const positions = JOBS_SORTED.map((job) => {
      const at = html.indexOf(job);
      expect(at, `job ${job} on the page`).toBeGreaterThanOrEqual(0);
      return at;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each([
    ['fixtures/refresh', true],
    ['notes/backup', true],
    ['lane/sync', false],
    ['digest/render', false],
  ])('marks %s as warn: %s', async (job, warn) => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    const row = rowFor(html, job);
    if (warn) {
      expect(row).toMatch(/^<tr[^>]*class="warn"/);
    } else {
      expect(row).not.toContain('class="warn"');
    }
  });

  it('renders a null owner as an em dash', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    expect(rowFor(html, 'digest/render')).toContain('—');
  });

  it('answers 200 with the nothing-ran message for an empty night', async () => {
    const res = await app().request(`/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('counts a bad line and still shows the good row', async () => {
    const res = await app().request(`/digest/${BAD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 bad line');
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/<night>', () => {
  it('answers 200 with night, rows and badLines', async () => {
    const res = await app().request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe(NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(JOBS_SORTED);
  });

  it('gives each row the full set of fields', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as DigestJson;
    const keys = ['job', 'owner', 'runs', 'ok', 'retries', 'fail', 'lastStatus', 'lastError', 'firstAt', 'lastAt'];
    for (const row of body.rows) {
      expect(Object.keys(row).sort()).toEqual([...keys].sort());
    }
  });

  it('counts a job with retries and a recovery', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as DigestJson;
    const row = body.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual<DigestRow>({
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

  it('keeps a failed job with its error', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as DigestJson;
    expect(body.rows.find((r) => r.job === 'notes/backup')).toMatchObject({
      fail: 1,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('keeps a null owner as null', async () => {
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as DigestJson;
    expect(body.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });

  it('answers 200 with no rows for an empty night', async () => {
    const res = await app().request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY_NIGHT, rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good row', async () => {
    const res = await app().request(`/api/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'notes/backup']);
  });
});

describe('digest routes share the same jobs', () => {
  it('page and JSON list the same jobs in the same order', async () => {
    const html = await (await app().request(`/digest/${NIGHT}`)).text();
    const body = (await (await app().request(`/api/digest/${NIGHT}`)).json()) as DigestJson;
    const pageOrder = JOBS_SORTED.filter((job) => html.includes(job)).sort(
      (a, b) => html.indexOf(a) - html.indexOf(b),
    );
    expect(pageOrder).toEqual(body.rows.map((r) => r.job));
  });
});

describe('digest routes refuse unknown nights', () => {
  it.each([
    ['a night with no file', MISSING_NIGHT],
    ['a value that is not a date', 'not-a-date'],
  ])('404 for %s', async (_name, night) => {
    expect((await app().request(`/digest/${night}`)).status).toBe(404);
    expect((await app().request(`/api/digest/${night}`)).status).toBe(404);
  });
});
