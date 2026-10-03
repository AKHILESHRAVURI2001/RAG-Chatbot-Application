import { auditRepo } from './audit.queries';

export interface AuditActor {
  id: string;
  email: string;
}

export interface AuditEvent {
  actor: AuditActor | null;
  /** Dotted action name, e.g. `roles.create`. The part before the first dot is stored as the resource. */
  action: string;
  resourceId?: string | null;
  result: 'success' | 'failure';
  statusCode?: number | null;
  metadata?: Record<string, unknown> | null;
  /** For events with no signed-in actor yet (a failed login), the email that was attempted. */
  actorEmail?: string | null;
}

const SENSITIVE_KEY = /pass(word)?|token|secret|api[-_]?key|authorization|credential|private/i;

/** Removes anything that looks like a credential before it can reach the log. Applied to every entry, whatever the caller passed. */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactMetadata(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redactMetadata(v, depth + 1);
  }
  return out;
}

/**
 * Writes one audit entry. Auditing must never break the action it describes, so failures are
 * logged and swallowed.
 */
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    const dot = event.action.indexOf('.');
    await auditRepo.insert({
      actorId: event.actor?.id ?? null,
      actorEmail: event.actor?.email ?? event.actorEmail ?? null,
      action: event.action,
      resource: dot > 0 ? event.action.slice(0, dot) : event.action,
      resourceId: event.resourceId ?? null,
      result: event.result,
      statusCode: event.statusCode ?? null,
      metadata: event.metadata ? (redactMetadata(event.metadata) as Record<string, unknown>) : null,
    });
  } catch (err) {
    console.error('[audit] failed to record entry:', err);
  }
}
