import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { ALL_PERMISSIONS, isPermission, type Permission } from '../../shared';

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isSuper: boolean;
  /** Super roles hold every permission implicitly, so they list the full catalog here (nothing is stored for them). */
  permissions: Permission[];
  userCount: number;
  createdAt: string;
}

export interface RoleWriteInput {
  name: string;
  description: string;
  permissions: Permission[];
}

function mapRow(row: any): RoleRow {
  const stored: string[] = row.permissions ?? [];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    isSuper: row.is_super,
    // Rows naming a permission that no longer exists in the registry are ignored, never trusted.
    permissions: row.is_super ? [...ALL_PERMISSIONS] : stored.filter(isPermission).sort(),
    userCount: row.user_count ?? 0,
    createdAt: row.created_at,
  };
}

const SELECT_ROLES = `
  select r.*,
         (select count(*)::int from admin_users u where u.role_id = r.id) as user_count,
         coalesce((select array_agg(rp.permission) from role_permissions rp where rp.role_id = r.id), '{}') as permissions
  from roles r`;

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function replacePermissions(client: PoolClient, roleId: string, permissions: Permission[]): Promise<void> {
  await client.query('delete from role_permissions where role_id = $1', [roleId]);
  if (permissions.length > 0) {
    await client.query('insert into role_permissions (role_id, permission) select $1, unnest($2::text[])', [roleId, permissions]);
  }
}

export const rolesRepo = {
  async list(): Promise<RoleRow[]> {
    const { rows } = await pool.query(`${SELECT_ROLES} order by r.is_super desc, r.is_system desc, lower(r.name)`);
    return rows.map(mapRow);
  },

  async findById(id: string): Promise<RoleRow | null> {
    const { rows } = await pool.query(`${SELECT_ROLES} where r.id = $1`, [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findByName(name: string): Promise<RoleRow | null> {
    const { rows } = await pool.query(`${SELECT_ROLES} where lower(r.name) = lower($1)`, [name]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findSuperRole(): Promise<RoleRow | null> {
    const { rows } = await pool.query(`${SELECT_ROLES} where r.is_super order by r.created_at limit 1`);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async create(input: RoleWriteInput): Promise<RoleRow> {
    const id = await inTransaction(async (client) => {
      const { rows } = await client.query('insert into roles (name, description) values ($1, $2) returning id', [input.name, input.description]);
      await replacePermissions(client, rows[0].id, input.permissions);
      return rows[0].id as string;
    });
    return (await this.findById(id))!;
  },

  async update(id: string, input: RoleWriteInput): Promise<RoleRow> {
    await inTransaction(async (client) => {
      await client.query('update roles set name = $2, description = $3, updated_at = now() where id = $1', [id, input.name, input.description]);
      await replacePermissions(client, id, input.permissions);
    });
    return (await this.findById(id))!;
  },

  async deleteById(id: string): Promise<void> {
    await pool.query('delete from roles where id = $1', [id]);
  },
};
