// Runs every .sql file in db/migrations against DATABASE_URL, in order.
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Copy apps/server/.env.example to apps/server/.env and fill it in first.');
  process.exit(1);
}

try {
  const u = new URL(databaseUrl);
  console.log(`ℹ Connecting to host="${u.hostname}" port="${u.port}" db="${u.pathname.slice(1)}" user="${u.username}"`);
} catch {
  console.log('ℹ Could not parse DATABASE_URL to display connection target.');
}

const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  console.log('No migration files found.');
  process.exit(0);
}

// Auto-detect SSL: enabled for non-localhost by default unless overridden
const isLocalHost = /(^|@)(localhost|127\.0\.0\.1)([:/]|$)/.test(databaseUrl);
const useSsl = process.env.DATABASE_SSL ? process.env.DATABASE_SSL === 'true' : !isLocalHost;

const client = new pg.Client({ connectionString: databaseUrl, ssl: useSsl ? { rejectUnauthorized: false } : undefined });

try {
  await client.connect();
  for (const file of files) {
    console.log(`→ Applying ${file}`);
    const sql = readFileSync(path.join(migrationsDir, file), 'utf-8');
    await client.query(sql);
  }
  console.log('✅ All migrations applied.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
