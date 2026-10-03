import { pool } from '../../db/pool';

export interface AdminUserRow {
  id: string;
  email: string;
  passwordHash: string;
  roleId: string;
  roleName: string;
  roleIsSuper: boolean;
  createdAt: string;
}

/** The raw facts authorization is built from — read fresh on every request so a role change or deletion takes effect immediately. */
export interface PrincipalSource {
  id: string;
  email: string;
  role: { id: string; name: string; isSuper: boolean };
  permissions: string[];
}

const SELECT_USER = `
  select u.id, u.email, u.password_hash, u.role_id, u.created_at, r.name as role_name, r.is_super as role_is_super
  from admin_users u join roles r on r.id = u.role_id`;

function mapRow(row: any): AdminUserRow {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    roleId: row.role_id,
    roleName: row.role_name,
    roleIsSuper: row.role_is_super,
    createdAt: row.created_at,
  };
}

export const adminUsersRepo = {
  async findByEmail(email: string): Promise<AdminUserRow | null> {
    const { rows } = await pool.query(`${SELECT_USER} where lower(u.email) = lower($1)`, [email]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findById(id: string): Promise<AdminUserRow | null> {
    const { rows } = await pool.query(`${SELECT_USER} where u.id = $1`, [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findPrincipalSource(id: string): Promise<PrincipalSource | null> {
    const { rows } = await pool.query(
      `select u.id, u.email, r.id as role_id, r.name as role_name, r.is_super,
              coalesce(array_agg(rp.permission) filter (where rp.permission is not null), '{}') as permissions
       from admin_users u
       join roles r on r.id = u.role_id
       left join role_permissions rp on rp.role_id = r.id
       where u.id = $1
       group by u.id, r.id`,
      [id],
    );
    const row = rows[0];
    return row
      ? { id: row.id, email: row.email, role: { id: row.role_id, name: row.role_name, isSuper: row.is_super }, permissions: row.permissions }
      : null;
  },

  /** Upsert used by the create-admin CLI script — that script is how you bootstrap the very first, full-access account. */
  async create(email: string, passwordHash: string, roleId: string): Promise<AdminUserRow> {
    const { rows } = await pool.query(
      `insert into admin_users (email, password_hash, role_id) values ($1, $2, $3)
       on conflict (email) do update set password_hash = excluded.password_hash, role_id = excluded.role_id
       returning id`,
      [email, passwordHash, roleId],
    );
    return (await this.findById(rows[0].id))!;
  },

  /** Real create — rejects a duplicate email instead of silently overwriting it (unlike `create`, which the create-admin CLI script relies on upserting). */
  async createNew(email: string, passwordHash: string, roleId: string): Promise<AdminUserRow> {
    const { rows } = await pool.query('insert into admin_users (email, password_hash, role_id) values ($1, $2, $3) returning id', [email, passwordHash, roleId]);
    return (await this.findById(rows[0].id))!;
  },

  async count(): Promise<number> {
    const { rows } = await pool.query('select count(*)::int as count from admin_users');
    return rows[0].count;
  },

  /** How many accounts currently hold a super role — used to guard against ever deleting/demoting the last one. */
  async countSuperAdmins(): Promise<number> {
    const { rows } = await pool.query('select count(*)::int as count from admin_users u join roles r on r.id = u.role_id where r.is_super');
    return rows[0].count;
  },

  /** Every admin account, oldest first — password hashes are on the row but the admin panel must never surface them; only expose id/email/role/createdAt at the route layer. */
  async list(): Promise<AdminUserRow[]> {
    const { rows } = await pool.query(`${SELECT_USER} order by u.created_at asc`);
    return rows.map(mapRow);
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await pool.query('update admin_users set password_hash = $2 where id = $1', [id, passwordHash]);
  },

  async updateRole(id: string, roleId: string): Promise<void> {
    await pool.query('update admin_users set role_id = $2 where id = $1', [id, roleId]);
  },

  async deleteById(id: string): Promise<void> {
    await pool.query('delete from admin_users where id = $1', [id]);
  },
};
