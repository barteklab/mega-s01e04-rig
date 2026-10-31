import type { NightDigest } from '../digest/types.js';

const dash = '—';

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  const { rows, badLines } = digest;
  return (
    <>
      <h1>digest {night}</h1>
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fail</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr class={r.retries >= 3 || r.fail > 0 ? 'warn' : undefined}>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.fail}</td>
                <td>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {badLines > 0 ? (
        <p class="mute">
          {badLines} bad {badLines === 1 ? 'line' : 'lines'}
        </p>
      ) : null}
    </>
  );
}

export function NoDigest({ night }: { night: string }) {
  return (
    <>
      <h1>digest</h1>
      <p>no digest for {night}</p>
    </>
  );
}
