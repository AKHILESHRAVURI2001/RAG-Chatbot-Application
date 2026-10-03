import type { Router, RequestHandler } from 'express';
import type { Permission } from '../shared';
import { requirePermission } from '../middleware/requirePermission';
import { auditAction } from '../middleware/auditAction';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteConfig {
  method: HttpMethod;
  path: string;
  middleware?: RequestHandler[];
  handler: RequestHandler;
}

// Registers a batch of routes from a plain config array instead of one
// router.get/post(...) call per route — duplicating a route (or bulk-changing
// one, e.g. adding a middleware to every entry) is then a one-line edit to the array.
export function registerRoutes(router: Router, routes: RouteConfig[]): void {
  for (const route of routes) {
    router[route.method](route.path, ...(route.middleware ?? []), route.handler);
  }
}

export interface SecuredRouteConfig extends RouteConfig {
  /** Required on purpose: an admin route can't be registered without saying who may call it (any one of several is enough). */
  permission: Permission | Permission[];
  /** Audit action name (`faqs.delete`). Set it on everything that changes data or exports it. */
  audit?: string;
}

/**
 * `registerRoutes` for admin endpoints. The permission check runs before the route's own
 * middleware (so an unauthorized upload is never even parsed) and the audit entry is opened
 * before the check (so denied attempts are logged). Callers must already be authenticated.
 */
export function registerSecuredRoutes(router: Router, routes: SecuredRouteConfig[]): void {
  registerRoutes(
    router,
    routes.map(({ permission, audit, middleware, ...route }) => ({
      ...route,
      middleware: [
        ...(audit ? [auditAction(audit)] : []),
        requirePermission(...(Array.isArray(permission) ? permission : [permission])),
        ...(middleware ?? []),
      ],
    })),
  );
}
