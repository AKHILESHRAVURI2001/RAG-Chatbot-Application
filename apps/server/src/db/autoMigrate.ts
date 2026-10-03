import fs from 'fs';
import path from 'path';
import { pool } from './pool';

export async function ensureDbSchema(): Promise<void> {
  try {
    const cwdSchema = path.resolve(process.cwd(), 'db/schema.sql');
    const relativeSchema = path.resolve(__dirname, '../../db/schema.sql');
    const schemaPath = fs.existsSync(cwdSchema) ? cwdSchema : relativeSchema;

    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
    }
  } catch (err: any) {
    console.warn('[db] Schema check warning (non-fatal):', err.message);
  }
}
