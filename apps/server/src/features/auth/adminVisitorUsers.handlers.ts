import type { Request, Response, NextFunction } from 'express';
import { visitorUsersRepo } from '../../db/queries/visitorUsers.queries';
import { visitorAuthService } from './visitorAuthService';
import type { VisitorUserDTO } from '../../shared';

function toDTO(u: any): VisitorUserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    messageCount: Number(u.messageCount || u.message_count || 0),
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
    lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : new Date().toISOString(),
  };
}

export async function handleListVisitorUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const users = await visitorUsersRepo.list(search);
    res.json(users.map(toDTO));
  } catch (err) {
    next(err);
  }
}

export async function handleCreateVisitorUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    if (!email || !email.trim() || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email is required' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await visitorUsersRepo.findByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const passwordHash = await visitorAuthService.hashPassword(password);
    const created = await visitorUsersRepo.create(name, email, passwordHash);
    res.status(201).json(toDTO(created));
  } catch (err) {
    next(err);
  }
}

export async function handleVisitorPasswordReset(req: Request, res: Response, next: NextFunction) {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const user = await visitorUsersRepo.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const passwordHash = await visitorAuthService.hashPassword(password);
    await visitorUsersRepo.updatePassword(req.params.id, passwordHash);
    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
}

export async function handleResetVisitorQuota(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await visitorUsersRepo.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await visitorUsersRepo.resetMessageCount(req.params.id);
    res.json({ ok: true, message: 'Message quota reset to 0' });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteVisitorUser(req: Request, res: Response, next: NextFunction) {
  try {
    const deleted = await visitorUsersRepo.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
