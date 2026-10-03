import { pool } from '../../db/pool';

export interface VisitorUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  messageCount: number;
  createdAt: Date;
  lastLoginAt: Date;
}

export const visitorUsersRepo = {
  async findByEmail(email: string): Promise<VisitorUser | null> {
    const { rows } = await pool.query(
      `select id, name, email, password_hash as "passwordHash", role, message_count as "messageCount", created_at as "createdAt", last_login_at as "lastLoginAt"
       from visitor_users where lower(email) = lower($1)`,
      [email.trim()],
    );
    return rows[0] || null;
  },

  async findById(id: string): Promise<VisitorUser | null> {
    const { rows } = await pool.query(
      `select id, name, email, password_hash as "passwordHash", role, message_count as "messageCount", created_at as "createdAt", last_login_at as "lastLoginAt"
       from visitor_users where id = $1`,
      [id],
    );
    return rows[0] || null;
  },

  async create(name: string, email: string, passwordHash: string): Promise<VisitorUser> {
    const { rows } = await pool.query(
      `insert into visitor_users (name, email, password_hash, role, message_count, created_at, last_login_at)
       values ($1, $2, $3, 'visitor', 0, now(), now())
       returning id, name, email, password_hash as "passwordHash", role, message_count as "messageCount", created_at as "createdAt", last_login_at as "lastLoginAt"`,
      [name.trim(), email.trim().toLowerCase(), passwordHash],
    );
    return rows[0];
  },

  async updateLastLogin(id: string): Promise<void> {
    await pool.query(`update visitor_users set last_login_at = now() where id = $1`, [id]);
  },

  async list(search?: string): Promise<VisitorUser[]> {
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      const { rows } = await pool.query(
        `select id, name, email, password_hash as "passwordHash", role, message_count as "messageCount", created_at as "createdAt", last_login_at as "lastLoginAt"
         from visitor_users
         where lower(name) like $1 or lower(email) like $1
         order by created_at desc`,
        [q],
      );
      return rows;
    }
    const { rows } = await pool.query(
      `select id, name, email, password_hash as "passwordHash", role, message_count as "messageCount", created_at as "createdAt", last_login_at as "lastLoginAt"
       from visitor_users
       order by created_at desc`,
    );
    return rows;
  },

  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const { rowCount } = await pool.query(`update visitor_users set password_hash = $2 where id = $1`, [id, passwordHash]);
    return Boolean(rowCount && rowCount > 0);
  },

  async resetMessageCount(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(`update visitor_users set message_count = 0 where id = $1`, [id]);
    return Boolean(rowCount && rowCount > 0);
  },

  async incrementMessageCount(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(`update visitor_users set message_count = message_count + 1 where id = $1`, [id]);
    return Boolean(rowCount && rowCount > 0);
  },

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(`delete from visitor_users where id = $1`, [id]);
    return Boolean(rowCount && rowCount > 0);
  },

  async count(): Promise<number> {
    const { rows } = await pool.query(`select count(*)::int as count from visitor_users`);
    return rows[0]?.count ?? 0;
  },
};
