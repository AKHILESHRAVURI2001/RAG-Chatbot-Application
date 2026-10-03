import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../utils/errors';

/**
 * The one place errors become HTTP responses.
 * - `HttpError`  → its own status and message (written for the caller).
 * - `ZodError`   → 400 with the first problem in plain words (the request was invalid, not the server broken).
 * - anything else → 500. The real error is always logged; in production the caller only gets a generic message so
 *   internals (SQL, file paths, library errors) never leak. In development the message is kept to speed up debugging.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    return res.status(400).json({ error: `${where}${issue?.message ?? 'Invalid request.'}` });
  }

  console.error('Request failed:', err);
  const message = err instanceof Error ? err.message : 'Unexpected error';
  res.status(500).json({ error: env.NODE_ENV === 'production' ? 'Something went wrong on our side. Please try again.' : message });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}
