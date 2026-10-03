import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminUsersRepo } from './adminUsers.queries';
import { rolesRepo } from '../roles/roles.queries';
import { buildPrincipal, type AdminPrincipal } from './authorization';
import { env } from '../../config/env';

const BCRYPT_ROUNDS = 12;

/**
 * Admin and visitor tokens are signed with the same secret, so the `aud` claim is what keeps them
 * apart: an admin token is only ever accepted with aud "admin", and visitor tokens carry
 * aud "visitor". Without it, anyone could self-register as a visitor and use that token on admin routes.
 */
export const ADMIN_TOKEN_AUDIENCE = 'admin';

/** Deliberately minimal: the token proves identity only. The role and permissions are never read from it. */
export interface AdminJwtPayload {
  sub: string; // admin_users.id
  email: string;
}

export const authService = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  },

  async login(email: string, password: string): Promise<{ token: string; email: string }> {
    const user = await adminUsersRepo.findByEmail(email);
    const hash = user?.passwordHash ?? '$2a$12$invalidsaltinvalidsaltinvalidsaltinvalidsalt.......';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) throw new Error('Invalid email or password');

    const token = jwt.sign({ sub: user.id, email: user.email } satisfies AdminJwtPayload, env.ADMIN_JWT_SECRET, {
      expiresIn: env.ADMIN_JWT_EXPIRES_IN,
      audience: ADMIN_TOKEN_AUDIENCE,
    } as jwt.SignOptions);
    return { token, email: user.email };
  },

  verifyToken(token: string): AdminJwtPayload {
    return jwt.verify(token, env.ADMIN_JWT_SECRET, { audience: ADMIN_TOKEN_AUDIENCE }) as AdminJwtPayload;
  },

  /** The caller's current role and effective permissions, straight from the database. Null if the account no longer exists. */
  async loadPrincipal(accountId: string): Promise<AdminPrincipal | null> {
    const source = await adminUsersRepo.findPrincipalSource(accountId);
    return source ? buildPrincipal(source) : null;
  },

  /** Bootstrap used by the create-admin CLI: the account always gets the super role. */
  async upsertAdmin(email: string, password: string) {
    const superRole = await rolesRepo.findSuperRole();
    if (!superRole) throw new Error('No super-admin role exists yet — run the database migrations first (npm run migrate).');
    const passwordHash = await this.hashPassword(password);
    return adminUsersRepo.create(email.trim().toLowerCase(), passwordHash, superRole.id);
  },

  async createAdmin(email: string, password: string, roleId: string) {
    const passwordHash = await this.hashPassword(password);
    return adminUsersRepo.createNew(email.trim().toLowerCase(), passwordHash, roleId);
  },

  async changePassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await this.hashPassword(newPassword);
    await adminUsersRepo.updatePassword(id, passwordHash);
  },
};
