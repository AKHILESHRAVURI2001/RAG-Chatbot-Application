import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { visitorUsersRepo, type VisitorUser } from '../../db/queries/visitorUsers.queries';
import { env } from '../../config/env';

const BCRYPT_ROUNDS = 10;

// Visitor and admin tokens share a signing secret, so the audience keeps them apart (see ADMIN_TOKEN_AUDIENCE).
const VISITOR_TOKEN_AUDIENCE = 'visitor';

export interface VisitorJwtPayload {
  sub: string; // visitor_users.id
  email: string;
  name: string;
  role: string;
}

export const visitorAuthService = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  },

  async signup(name: string, email: string, password: string): Promise<{ token: string; user: { id: string; name: string; email: string } }> {
    const cleanEmail = email.trim().toLowerCase();
    const existing = await visitorUsersRepo.findByEmail(cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists. Please log in instead.');
    }
    const passwordHash = await this.hashPassword(password);
    const user = await visitorUsersRepo.create(name.trim() || 'Visitor', cleanEmail, passwordHash);

    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role } satisfies VisitorJwtPayload,
      env.ADMIN_JWT_SECRET,
      { expiresIn: '30d', audience: VISITOR_TOKEN_AUDIENCE } as jwt.SignOptions,
    );
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  },

  async login(email: string, password: string): Promise<{ token: string; user: { id: string; name: string; email: string } }> {
    const cleanEmail = email.trim().toLowerCase();
    const user = await visitorUsersRepo.findByEmail(cleanEmail);
    const hash = user?.passwordHash ?? '$2a$10$invalidsaltinvalidsaltinvalidsaltinvalidsalt.......';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) {
      throw new Error('Invalid email or password');
    }
    await visitorUsersRepo.updateLastLogin(user.id);

    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role } satisfies VisitorJwtPayload,
      env.ADMIN_JWT_SECRET,
      { expiresIn: '30d', audience: VISITOR_TOKEN_AUDIENCE } as jwt.SignOptions,
    );
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  },

  verifyToken(token: string): VisitorJwtPayload | null {
    try {
      const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as VisitorJwtPayload & { aud?: string | string[] };
      // Tokens issued before audiences existed have none and stay valid; an admin token (aud "admin") never counts as a visitor.
      if (payload.aud !== undefined && ![payload.aud].flat().includes(VISITOR_TOKEN_AUDIENCE)) return null;
      return payload;
    } catch {
      return null;
    }
  },
};
