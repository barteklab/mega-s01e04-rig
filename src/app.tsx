import { Hono } from 'hono';
import { readNight } from './digest/read-night.js';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readNight } from './digest/read-night.js';
import { readStatus } from './status.js';
import { DigestPage, NoDigest } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.json({ error: 'no digest for this night' }, 404);
    return c.json({ night, rows: digest.rows, badLines: digest.badLines });
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (digest === null) {
      return c.html(
        <Layout title={`digest ${night}`} lane={lane()}>
          <NoDigest night={night} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });

  return app;
}
