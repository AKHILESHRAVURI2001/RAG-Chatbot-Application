import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { adminUsersRepo } from '../../../src/features/auth/adminUsers.queries';
import { authService } from '../../../src/features/auth/authService';
import { visitorAuthService } from '../../../src/features/auth/visitorAuthService';

vi.mock('../../../src/features/auth/adminUsers.queries', () => ({
  adminUsersRepo: { findByEmail: vi.fn(), create: vi.fn(), count: vi.fn(), findPrincipalSource: vi.fn() },
}));
vi.mock('../../../src/features/roles/roles.queries', () => ({ rolesRepo: { findSuperRole: vi.fn() } }));
vi.mock('../../../src/db/queries/visitorUsers.queries', () => ({ visitorUsersRepo: {} }));

const SECRET = process.env.ADMIN_JWT_SECRET as string;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authService.login', () => {
  it('succeeds with the correct password and returns a verifiable session token', async () => {
    const passwordHash = await authService.hashPassword('correct-horse-battery-staple');
    (adminUsersRepo.findByEmail as any).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', passwordHash, createdAt: 'now' });

    const { token, email } = await authService.login('admin@example.com', 'correct-horse-battery-staple');
    expect(email).toBe('admin@example.com');
    expect(authService.verifyToken(token)).toMatchObject({ sub: 'admin-1', email: 'admin@example.com' });
  });

  it('puts identity only in the token — never a role or permissions', async () => {
    const passwordHash = await authService.hashPassword('a-long-enough-password');
    (adminUsersRepo.findByEmail as any).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', passwordHash, roleName: 'Admin', createdAt: 'now' });

    const { token } = await authService.login('admin@example.com', 'a-long-enough-password');
    const claims = jwt.decode(token) as Record<string, unknown>;
    expect(claims).not.toHaveProperty('role');
    expect(claims).not.toHaveProperty('permissions');
  });

  it('rejects the wrong password with a generic message', async () => {
    const passwordHash = await authService.hashPassword('the-real-password');
    (adminUsersRepo.findByEmail as any).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', passwordHash, createdAt: 'now' });

    await expect(authService.login('admin@example.com', 'wrong-password')).rejects.toThrow('Invalid email or password');
  });

  it('rejects a nonexistent email with the exact same generic message (no user enumeration)', async () => {
    (adminUsersRepo.findByEmail as any).mockResolvedValue(null);
    await expect(authService.login('nobody@example.com', 'anything')).rejects.toThrow('Invalid email or password');
  });
});

describe('authService.verifyToken', () => {
  it('rejects a garbage token', () => {
    expect(() => authService.verifyToken('not-a-real-token')).toThrow();
  });

  it('rejects a token with no audience (e.g. one minted before audiences existed)', () => {
    const legacy = jwt.sign({ sub: 'x', email: 'a@b.c', role: 'admin' }, SECRET);
    expect(() => authService.verifyToken(legacy)).toThrow();
  });
});

describe('visitor tokens can never act as admin tokens', () => {
  it('a visitor token — signed with the same secret — is rejected by admin verification', () => {
    const visitorToken = jwt.sign({ sub: 'v1', email: 'v@example.com', name: 'V', role: 'visitor' }, SECRET, { audience: 'visitor' });
    expect(() => authService.verifyToken(visitorToken)).toThrow();
  });

  it('even a visitor token claiming role "admin" is rejected', () => {
    const forged = jwt.sign({ sub: 'v1', email: 'v@example.com', role: 'admin' }, SECRET, { audience: 'visitor' });
    expect(() => authService.verifyToken(forged)).toThrow();
  });

  it('an admin token is not accepted as a visitor token', async () => {
    const passwordHash = await authService.hashPassword('a-long-enough-password');
    (adminUsersRepo.findByEmail as any).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', passwordHash });
    const { token } = await authService.login('admin@example.com', 'a-long-enough-password');
    expect(visitorAuthService.verifyToken(token)).toBeNull();
  });

  it('visitor tokens issued before audiences existed still work', () => {
    const old = jwt.sign({ sub: 'v1', email: 'v@example.com', name: 'V', role: 'visitor' }, SECRET);
    expect(visitorAuthService.verifyToken(old)).toMatchObject({ sub: 'v1' });
  });
});
