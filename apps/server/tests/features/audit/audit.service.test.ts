import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditRepo } from '../../../src/features/audit/audit.queries';
import { recordAudit, redactMetadata } from '../../../src/features/audit/audit.service';

vi.mock('../../../src/features/audit/audit.queries', () => ({ auditRepo: { insert: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('redactMetadata', () => {
  it('redacts anything that looks like a credential, at any depth', () => {
    const out = redactMetadata({ name: 'Support', password: 'hunter2', nested: { apiKey: 'sk-123', token: 't', ok: 1 }, list: [{ secret: 's' }] });
    expect(out).toEqual({ name: 'Support', password: '[redacted]', nested: { apiKey: '[redacted]', token: '[redacted]', ok: 1 }, list: [{ secret: '[redacted]' }] });
  });
});

describe('recordAudit', () => {
  it('stores the resource as the part of the action before the first dot, and redacts metadata on the way in', async () => {
    await recordAudit({ actor: { id: 'u1', email: 'a@example.com' }, action: 'roles.create', result: 'success', statusCode: 201, metadata: { name: 'X', password: 'p' } });
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', actorEmail: 'a@example.com', action: 'roles.create', resource: 'roles', result: 'success', metadata: { name: 'X', password: '[redacted]' } }),
    );
  });

  it('records the attempted email for a failed login that has no actor', async () => {
    await recordAudit({ actor: null, actorEmail: 'who@example.com', action: 'auth.login', result: 'failure', statusCode: 401 });
    expect(auditRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ actorId: null, actorEmail: 'who@example.com', resource: 'auth' }));
  });

  it('never throws — auditing must not break the action it describes', async () => {
    (auditRepo.insert as any).mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordAudit({ actor: null, action: 'x.y', result: 'success' })).resolves.toBeUndefined();
  });
});
