export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night. ok, retries and fail count log lines, so runs is their sum.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  ok: number;
  retries: number;
  fail: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  rows: DigestRow[]; // sorted by job
  badLines: number;
};

// null: no file for this night. An empty file is a digest with no rows.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
