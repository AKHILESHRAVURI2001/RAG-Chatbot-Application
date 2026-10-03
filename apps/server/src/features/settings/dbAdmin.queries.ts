import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../db/pool';

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'db', 'migrations');

export interface TableSize {
  name: string;
  bytes: number;
  pretty: string;
}

export const dbAdminRepo = {
  async listSettingsKeys(): Promise<Set<string>> {
    const { rows } = await pool.query('select key from settings');
    return new Set(rows.map((r) => r.key as string));
  },

  async tableExists(tableName: string): Promise<boolean> {
    const { rows } = await pool.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = $1`,
      [tableName],
    );
    return rows.length > 0;
  },

  async listColumns(tableName: string, columnNames: string[]): Promise<string[]> {
    const { rows } = await pool.query(
      `select column_name from information_schema.columns where table_name = $1 and column_name = any($2::text[])`,
      [tableName, columnNames],
    );
    return rows.map((r) => r.column_name as string);
  },

  async getDatabaseSize(): Promise<{ bytes: number; pretty: string }> {
    const { rows } = await pool.query(
      `select pg_database_size(current_database()) as bytes, pg_size_pretty(pg_database_size(current_database())) as pretty`,
    );
    return { bytes: Number(rows[0].bytes), pretty: rows[0].pretty as string };
  },

  async getTableSizes(): Promise<TableSize[]> {
    const { rows } = await pool.query(
      `select relname as name,
              pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) as bytes,
              pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)) as pretty
       from pg_stat_user_tables
       where schemaname = 'public'
       order by bytes desc`,
    );
    return rows.map((r) => ({ name: r.name as string, bytes: Number(r.bytes), pretty: r.pretty as string }));
  },

  listMigrationFiles(): string[] {
    return fs.existsSync(MIGRATIONS_DIR) ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort() : [];
  },

  async applyMigrationFile(file: string): Promise<void> {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query(sql);
  },
};
