import { useMemo, useState } from 'react';
import { FiCheck, FiShield } from 'react-icons/fi';
import type { Permission, PermissionGroup, RoleDTO } from '../../shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, FormInput, FormTextarea } from '../ui/FormField';
import { toast } from '../ui/Toast';
import PermissionPicker from './PermissionPicker';
import PermissionSummary from './PermissionSummary';

const NAME_MIN = 2;
const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;
const STEPS = ['Details', 'Permissions', 'Review'] as const;

interface RoleEditorProps {
  /** Omit to create a new role. */
  role?: RoleDTO;
  /** Every existing role — used to catch duplicate names before the server has to. */
  roles: RoleDTO[];
  groups: PermissionGroup[];
  /** Open on the permissions step in read-only mode (a role the user can look at but not change). */
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Create / edit a role in three steps — details, permissions, review. All validation is repeated
 * on the server (this just spares a round trip), and the server is also what refuses permissions
 * the signed-in admin doesn't hold themselves; the picker greys those out so it's clear why.
 */
export default function RoleEditor({ role, roles, groups, readOnly, onClose, onSaved }: RoleEditorProps) {
  const { me, can } = useAuth();
  const [step, setStep] = useState(readOnly ? 1 : 0);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<Permission>>(() => new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameLocked = !!role?.isSystem;
  const unavailable = useMemo(() => {
    if (me.role.isSuper) return new Set<Permission>();
    return new Set(groups.flatMap((g) => g.actions.map((a) => a.permission)).filter((p) => !can(p)));
  }, [groups, me.role.isSuper, can]);

  const trimmedName = name.trim();
  const nameError =
    trimmedName.length < NAME_MIN
      ? `Give the role a name (at least ${NAME_MIN} characters).`
      : trimmedName.length > NAME_MAX
        ? `Keep the name to ${NAME_MAX} characters or fewer.`
        : roles.some((r) => r.id !== role?.id && r.name.toLowerCase() === trimmedName.toLowerCase())
          ? `A role named “${trimmedName}” already exists.`
          : null;
  const descriptionError = description.length > DESCRIPTION_MAX ? `Keep the description to ${DESCRIPTION_MAX} characters or fewer.` : null;
  const detailsValid = !nameError && !descriptionError;

  function next() {
    if (step === 0) {
      setTouched(true);
      if (!detailsValid) return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function save() {
    if (!detailsValid) {
      setStep(0);
      setTouched(true);
      return;
    }
    setSaving(true);
    try {
      const input = { name: trimmedName, description: description.trim(), permissions: [...selected] };
      if (role) await api.updateRole(role.id, input);
      else await api.createRole(input);
      toast.success(role ? `Role “${trimmedName}” updated.` : `Role “${trimmedName}” created.`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save the role.');
    } finally {
      setSaving(false);
    }
  }

  const title = readOnly ? `Role: ${role?.name}` : role ? `Edit role: ${role.name}` : 'Create role';

  return (
    <Modal icon={<FiShield aria-hidden />} title={title} onClose={onClose} wide>
      {!readOnly && (
        <ol className="stepper" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className={`stepper-step ${i === step ? 'current' : ''} ${i < step ? 'done' : ''}`} aria-current={i === step ? 'step' : undefined}>
              <span className="stepper-dot">{i < step ? <FiCheck aria-hidden /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}

      {step === 0 && (
        <div>
          <FormField label="Role name" description={nameLocked ? 'Built-in roles can’t be renamed.' : 'A job or function, e.g. “Content Manager”.'}>
            <FormInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={nameLocked}
              maxLength={NAME_MAX + 10}
              autoFocus={!nameLocked}
              aria-invalid={touched && !!nameError}
              aria-describedby={touched && nameError ? 'role-name-error' : undefined}
            />
            {touched && nameError && <div id="role-name-error" className="field-error" role="alert">{nameError}</div>}
          </FormField>
          <FormField label="Description" description="Optional — helps whoever assigns this role understand what it is for.">
            <FormTextarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!descriptionError} />
            {descriptionError && <div className="field-error" role="alert">{descriptionError}</div>}
            <div className="muted small" style={{ textAlign: 'right' }}>{description.length}/{DESCRIPTION_MAX}</div>
          </FormField>
        </div>
      )}

      {step === 1 && (
        <div>
          {role?.isSuper ? (
            <p className="muted">This role always has every permission — including any added in the future — so there is nothing to choose.</p>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              {readOnly ? 'The permissions this role grants.' : 'Choose what people with this role can do. Anything not ticked is blocked, in the menu and on the server.'}
            </p>
          )}
          <PermissionPicker groups={groups} selected={selected} onChange={setSelected} unavailable={unavailable} readOnly={readOnly || role?.isSuper} />
        </div>
      )}

      {step === 2 && (
        <div>
          <h4 style={{ margin: '0 0 4px' }}>{trimmedName}</h4>
          {description.trim() && <p className="muted" style={{ marginTop: 0 }}>{description.trim()}</p>}
          <p className="muted small">{selected.size} permission{selected.size === 1 ? '' : 's'} granted</p>
          {selected.size === 0 && <div className="role-banner">This role grants no permissions — people with it won’t be able to open anything.</div>}
          <PermissionSummary groups={groups} permissions={[...selected]} />
        </div>
      )}

      <div className="row-gap" style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>{readOnly ? 'Close' : 'Cancel'}</Button>
        {!readOnly && (
          <div className="row-gap">
            {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={saving}>Back</Button>}
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>Next</Button>
            ) : (
              <Button onClick={save} loading={saving}>{role ? 'Save changes' : 'Create role'}</Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
