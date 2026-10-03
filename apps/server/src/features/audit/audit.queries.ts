import { pool } from '../../db/pool';
import type { AuditLogEntryDTO } from '../../shared';

export interface AuditInsert {
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  result: 'success' | 'failure';
  statusCode: number | null;
  metadata: Record<string, unknown> | null;
}

function mapRow(row: any): AuditLogEntryDTO {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    result: row.result,
    statusCode: row.status_code,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export const auditRepo = {
  async insert(entry: AuditInsert): Promise<void> {
    await pool.query(
      `insert into audit_log (actor_id, actor_email, action, resource, resource_id, result, status_code, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.actorId,
        entry.actorEmail,
        entry.action,
        entry.resource,
        entry.resourceId,
        entry.result,
        entry.statusCode,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ],
    );
  },

  async list(opts: { limit: number; offset: number; resource?: string }): Promise<{ entries: AuditLogEntryDTO[]; total: number }> {
    const filter = opts.resource ? 'where resource = $3' : '';
    const listParams: unknown[] = opts.resource ? [opts.limit, opts.offset, opts.resource] : [opts.limit, opts.offset];
    const [rows, count] = await Promise.all([
      pool.query(`select * from audit_log ${filter} order by created_at desc limit $1 offset $2`, listParams),
      pool.query(`select count(*)::int as count from audit_log ${opts.resource ? 'where resource = $1' : ''}`, opts.resource ? [opts.resource] : []),
    ]);
    return { entries: rows.rows.map(mapRow), total: count.rows[0].count };
  },
};
