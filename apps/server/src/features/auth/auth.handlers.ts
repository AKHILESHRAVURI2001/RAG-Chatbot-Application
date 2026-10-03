import type { Response } from 'express';
import { z } from 'zod';
import type { AuthMeDTO } from '../../shared';
import { authService } from './authService';
import { listPermissions } from './authorization';
import { recordAudit } from '../audit/audit.service';
import type { AuthedRequest } from './authMiddleware';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function handleLogin(req: AuthedRequest, res: Response) {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Please provide a valid email and password.' });
  }
  const { email, password } = parseResult.data;
  try {
    const { token, email: userEmail } = await authService.login(email, password);
    void recordAudit({ actor: null, actorEmail: userEmail, action: 'auth.login', result: 'success', statusCode: 200 });
    res.json({ token, email: userEmail });
  } catch (err: any) {
    void recordAudit({ actor: null, actorEmail: email, action: 'auth.login', result: 'failure', statusCode: 401 });
    res.status(401).json({ error: err?.message || 'Invalid email or password' });
  }
}

/** Who is signed in and exactly what they may do. The admin UI uses this to adapt itself; the server still re-checks every request. */
export function handleMe(req: AuthedRequest, res: Response) {
  const user = req.adminUser;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized — user session missing' });
  }
  const body: AuthMeDTO = { id: user.id, email: user.email, role: user.role, permissions: listPermissions(user) };
  res.json(body);
}
