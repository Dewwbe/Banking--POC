// Workstream D — verifies the hash chain of the custom audit log (detects edited, inserted or deleted rows).
// Run inside the CMS container:   docker compose exec cms npm run verify:audit
// Tamper test (AUD-08):           docker compose exec db psql -U strapi -d strapi \
//                                   -c "UPDATE poc_audit_logs SET actor_email='attacker@x' WHERE sequence=3;"
//                                 then run the verifier again — it must report the break at sequence 3.
import { createHash } from 'node:crypto';
import pg from 'pg';

pg.types.setTypeParser(1114, (s) => new Date(s.replace(' ', 'T') + 'Z')); // timestamp → UTC
pg.types.setTypeParser(20, (s) => s); // bigint stays string

// MUST match HASHED_FIELDS in src/poc/audit.ts
const HASHED = ['sequence', 'occurredAt', 'environment', 'action', 'outcome', 'reason', 'channel', 'actorId', 'actorEmail',
  'actorRoles', 'contentType', 'targetDocumentId', 'targetLocale', 'workflowStageBefore', 'workflowStageAfter',
  'changedFields', 'before', 'after', 'contentHash', 'prevEntryHash'];
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);

const client = new pg.Client({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});
await client.connect();
const { rows } = await client.query('SELECT * FROM poc_audit_logs ORDER BY sequence ASC');
await client.end();

let prev = null;
let expectedSeq = 1;
let problems = 0;
for (const row of rows) {
  const entry = {};
  for (const f of HASHED) entry[f] = row[snake(f)] ?? null;
  entry.sequence = String(entry.sequence);
  if (entry.occurredAt instanceof Date) entry.occurredAt = entry.occurredAt.toISOString();

  if (Number(entry.sequence) !== expectedSeq) { console.log(`GAP     expected sequence ${expectedSeq}, found ${entry.sequence} (row deleted?)`); problems++; }
  if ((entry.prevEntryHash ?? null) !== prev) { console.log(`BROKEN  sequence ${entry.sequence}: prevEntryHash does not match previous entry`); problems++; }
  const h = createHash('sha256').update(`${entry.prevEntryHash ?? 'GENESIS'}|${canonical(entry)}`).digest('hex');
  if (h !== row.entry_hash) { console.log(`ALTERED sequence ${entry.sequence}: content does not match entryHash (${row.action} by ${row.actor_email})`); problems++; }
  prev = row.entry_hash;
  expectedSeq = Number(entry.sequence) + 1;
}
console.log(`\nChecked ${rows.length} entries — ${problems === 0 ? 'chain INTACT' : `${problems} problem(s) found`}.`);
console.log('Note: an intact chain proves consistency, not authenticity — anyone with DB write access can rebuild the whole chain.');
process.exit(problems ? 1 : 0);
