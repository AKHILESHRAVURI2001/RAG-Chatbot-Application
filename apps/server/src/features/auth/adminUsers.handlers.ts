import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AdminUserDTO } from '../../shared';
import { adminUsersRepo, type AdminUserRow } from './adminUsers.queries';
import { rolesRepo } from '../roles/roles.queries';
import { authService } from './authService';
import { canManageRole } from './authorization';
import type { AuthedRequest } from './authMiddleware';

function toDTO(u: AdminUserRow): AdminUserDTO {
  return { id: u.id, email: u.email, role: { id: u.roleId, name: u.roleName, isSuper: u.roleIsSuper }, createdAt: u.createdAt };
}

const NOT_ALLOWED_ROLE = "You can't manage an account or role with more access than you have.";

/** The role an account currently holds, as a permission set the escalation guard can reason about. */
async function currentRoleOf(user: AdminUserRow) {
  return rolesRepo.findById(user.roleId);
}

export async function handleListAdmins(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json((await adminUsersRepo.list()).map(toDTO));
  } catch (err) {
    next(err);
  }
}

const createSchema = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200), roleId: z.string().uuid() });

export async function handleCreateAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { email, password, roleId } = createSchema.parse(req.body);
    const role = await rolesRepo.findById(roleId);
    if (!role) return res.status(400).json({ error: 'That role does not exist.' });
    if (!canManageRole(req.adminUser, role)) return res.status(403).json({ error: NOT_ALLOWED_ROLE });
    const existing = await adminUsersRepo.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'An admin with that email already exists.' });

    const created = await authService.createAdmin(email, password, role.id);
    res.locals.auditMeta = { email: created.email, role: role.name };
    res.status(201).json(toDTO(created));
  } catch (err) {
    next(err);
  }
}

const passwordSchema = z.object({ password: z.string().min(8).max(200) });

export async function handleAdminPasswordReset(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { password } = passwordSchema.parse(req.body);
    const user = await adminUsersRepo.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Admin not found' });
    // Resetting someone else's password is a takeover of that account — only allowed over accounts you could manage anyway.
    const targetRole = await currentRoleOf(user);
    if (user.id !== req.adminUser?.id && (!targetRole || !canManageRole(req.adminUser, targetRole))) {
      return res.status(403).json({ error: NOT_ALLOWED_ROLE });
    }
    await authService.changePassword(user.id, password);
    res.locals.auditMeta = { email: user.email };
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateAdminRole(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { roleId } = z.object({ roleId: z.string().uuid() }).parse(req.body);
    const target = await adminUsersRepo.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (req.adminUser?.id === target.id) return res.status(400).json({ error: "You can't change your own role." });

    const [newRole, oldRole] = await Promise.all([rolesRepo.findById(roleId), currentRoleOf(target)]);
    if (!newRole) return res.status(400).json({ error: 'That role does not exist.' });
    // Both the role being taken away and the one being given must be within the actor's own reach.
    if (!oldRole || !canManageRole(req.adminUser, oldRole) || !canManageRole(req.adminUser, newRole)) {
      return res.status(403).json({ error: NOT_ALLOWED_ROLE });
    }
    if (target.roleIsSuper && !newRole.isSuper && (await adminUsersRepo.countSuperAdmins()) <= 1) {
      return res.status(400).json({ error: 'Cannot demote the last remaining full-access admin.' });
    }

    await adminUsersRepo.updateRole(target.id, newRole.id);
    res.locals.auditMeta = { email: target.email, from: target.roleName, to: newRole.name };
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const target = await adminUsersRepo.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (req.adminUser?.id === target.id) return res.status(400).json({ error: "You can't delete your own account while signed in as it." });

    const targetRole = await currentRoleOf(target);
    if (!targetRole || !canManageRole(req.adminUser, targetRole)) return res.status(403).json({ error: NOT_ALLOWED_ROLE });

    if ((await adminUsersRepo.count()) <= 1) return res.status(400).json({ error: 'Cannot delete the last remaining admin account.' });
    if (target.roleIsSuper && (await adminUsersRepo.countSuperAdmins()) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining full-access admin.' });
    }

    await adminUsersRepo.deleteById(target.id);
    res.locals.auditMeta = { email: target.email, role: target.roleName };
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
