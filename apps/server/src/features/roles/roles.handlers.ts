import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPermissionGroups, isPermission, type Permission, type RoleCatalogDTO, type RoleDTO } from '../../shared';
import { rolesRepo, type RoleRow } from './roles.queries';
import { canManageRole } from '../auth/authorization';
import type { AuthedRequest } from '../auth/authMiddleware';

function toDTO(r: RoleRow): RoleDTO {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isSuper: r.isSuper,
    permissions: r.permissions,
    userCount: r.userCount,
    createdAt: r.createdAt,
  };
}

const CANT_GRANT = "You can't grant permissions you don't have yourself.";

const roleInputSchema = z.object({
  name: z.string().trim().min(2, 'Role name must be at least 2 characters.').max(50, 'Role name must be 50 characters or fewer.'),
  description: z.string().trim().max(200, 'Description must be 200 characters or fewer.').default(''),
  permissions: z
    .array(z.string())
    .max(500)
    .superRefine((list, ctx) => {
      const unknown = list.filter((p) => !isPermission(p));
      if (unknown.length > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown permission: ${unknown[0]}` });
    })
    .transform((list) => [...new Set(list)] as Permission[]),
});

/** Zod failures are caller mistakes (400), not server errors — surface the first message. */
function badRequest(res: Response, err: z.ZodError) {
  return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request.' });
}

export async function handleListRoles(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json((await rolesRepo.list()).map(toDTO));
  } catch (err) {
    next(err);
  }
}

/** The registry of every permission that exists, so the Roles screen renders new modules without a UI change. */
export function handleGetCatalog(_req: AuthedRequest, res: Response) {
  const body: RoleCatalogDTO = { groups: getPermissionGroups() };
  res.json(body);
}

export async function handleCreateRole(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = roleInputSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const input = parsed.data;

    if (!canManageRole(req.adminUser, { isSuper: false, permissions: input.permissions })) return res.status(403).json({ error: CANT_GRANT });
    if (await rolesRepo.findByName(input.name)) return res.status(409).json({ error: `A role named "${input.name}" already exists.` });

    const created = await rolesRepo.create(input);
    res.locals.auditMeta = { name: created.name, permissionCount: created.permissions.length };
    res.status(201).json(toDTO(created));
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateRole(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = roleInputSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const input = parsed.data;

    const existing = await rolesRepo.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found.' });
    if (existing.isSuper) return res.status(400).json({ error: 'The full-access role always has every permission and can’t be edited.' });
    if (existing.isSystem && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      return res.status(400).json({ error: 'Built-in roles can’t be renamed.' });
    }

    // Both what the role has now and what it would have after the edit must be within the actor's own permissions.
    if (!canManageRole(req.adminUser, existing) || !canManageRole(req.adminUser, { isSuper: false, permissions: input.permissions })) {
      return res.status(403).json({ error: CANT_GRANT });
    }
    const sameName = await rolesRepo.findByName(input.name);
    if (sameName && sameName.id !== existing.id) return res.status(409).json({ error: `A role named "${input.name}" already exists.` });

    const updated = await rolesRepo.update(existing.id, { ...input, name: existing.isSystem ? existing.name : input.name });
    const before = new Set(existing.permissions);
    const after = new Set(updated.permissions);
    res.locals.auditMeta = {
      name: updated.name,
      added: updated.permissions.filter((p) => !before.has(p)),
      removed: existing.permissions.filter((p) => !after.has(p)),
    };
    res.json(toDTO(updated));
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteRole(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const existing = await rolesRepo.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found.' });
    if (existing.isSystem) return res.status(400).json({ error: 'Built-in roles can’t be deleted.' });
    if (!canManageRole(req.adminUser, existing)) return res.status(403).json({ error: CANT_GRANT });
    if (existing.userCount > 0) {
      return res.status(409).json({ error: `${existing.userCount} admin account(s) still use this role. Move them to another role first.` });
    }

    await rolesRepo.deleteById(existing.id);
    res.locals.auditMeta = { name: existing.name };
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
