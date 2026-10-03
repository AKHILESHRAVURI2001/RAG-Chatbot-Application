import type { Request, Response, NextFunction } from 'express';
import { dbAdminRepo } from '../../db/queries/dbAdmin.queries';
import { redisCache } from '../../cache/redis';
import { firebaseMirror } from '../reports/firebaseMirror';
import { queryCacheRepo } from '../../db/queries/queryCache.queries';
import { ensureDbSchema } from '../../db/autoMigrate';

// Operational actions: flush the answer cache, check the database schema, run migrations.

// The settings rows a healthy database is expected to contain.
const EXPECTED_SETTINGS_KEYS = [
  'llm', 'prompt', 'widget', 'cache', 'limits', 'apiKeys', 'chunking',
  'businessHours', 'firebase', 'voice', 'speechApiKeys', 'embeddingApiKeys',
];

export async function handleFlushCache(_req: Request, res: Response, next: NextFunction) {
  try {
    await queryCacheRepo.flush();
    await redisCache.flushAll();
    await firebaseMirror.clearCacheMirror();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function handleDbStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    const present = await dbAdminRepo.listSettingsKeys();
    const settingsKeys = EXPECTED_SETTINGS_KEYS.map((key) => ({ key, present: present.has(key) }));

    const visitorUsersTable = await dbAdminRepo.tableExists('visitor_users');
    const conversationsColumns = await dbAdminRepo.listColumns('conversations', ['blocked_until', 'block_reason']);
    const migrationFiles = dbAdminRepo.listMigrationFiles();
    const databaseSize = await dbAdminRepo.getDatabaseSize();
    const tableSizes = await dbAdminRepo.getTableSizes();

    const ok = settingsKeys.every((s) => s.present) && visitorUsersTable && conversationsColumns.length === 2;

    res.json({ ok, settingsKeys, visitorUsersTable, conversationsColumns, migrationFiles, databaseSize, tableSizes });
  } catch (err) {
    next(err);
  }
}

export async function handleDbMigrate(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDbSchema();

    const migrationFiles = dbAdminRepo.listMigrationFiles();
    const results: { file: string; ok: boolean; error?: string }[] = [];
    for (const file of migrationFiles) {
      try {
        await dbAdminRepo.applyMigrationFile(file);
        results.push({ file, ok: true });
      } catch (err: any) {
        // Migrations are written to be idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING),
        // so a failure here is reported per-file instead of aborting the whole request.
        results.push({ file, ok: false, error: err.message ?? String(err) });
      }
    }

    res.json({ ok: results.every((r) => r.ok), results });
  } catch (err) {
    next(err);
  }
}
