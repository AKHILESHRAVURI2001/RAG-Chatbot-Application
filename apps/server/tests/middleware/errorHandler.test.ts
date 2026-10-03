import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler';
import { HttpError } from '../../src/utils/errors';

function run(err: unknown) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = vi.fn((c: number) => ((res.statusCode = c), res));
  res.json = vi.fn((b: unknown) => ((res.body = b), res));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  errorHandler(err, {} as any, res, vi.fn());
  return res;
}

describe('errorHandler', () => {
  it('turns a validation failure into a 400 with a readable message, not a 500', () => {
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
    const res = run((parsed as any).error);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/^email: /);
  });

  it('uses the status and message of an HttpError', () => {
    const res = run(new HttpError(404, 'Role not found.'));
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Role not found.' });
  });

  it('returns 500 for an unexpected error (and logs it)', () => {
    const res = run(new Error('boom'));
    expect(res.statusCode).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});
