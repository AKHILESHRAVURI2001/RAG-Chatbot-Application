import { useMemo, useState } from 'react';
import { FiUsers, FiShield, FiList, FiLock } from 'react-icons/fi';
import type { Permission } from '../shared';
import { useAuth } from '../lib/authContext';
import { PageHeader } from '../components/ui/PageHeader';
import AdminUsersCard from '../components/AdminUsersCard';
import RolesPanel from '../components/access/RolesPanel';
import AuditLogPanel from '../components/access/AuditLogPanel';

const TABS = [
  { id: 'users', label: 'Admin users', icon: FiUsers, permission: 'users.view' },
  { id: 'roles', label: 'Roles & permissions', icon: FiShield, permission: 'roles.view' },
  { id: 'audit', label: 'Audit log', icon: FiList, permission: 'audit.view' },
] as const satisfies readonly { id: string; label: string; icon: unknown; permission: Permission }[];

type TabId = (typeof TABS)[number]['id'];

/** Who can sign in, what each role allows, and a record of changes — each tab appears only for people allowed to see it. */
export default function AccessControl() {
  const { can } = useAuth();
  const tabs = useMemo(() => TABS.filter((t) => can(t.permission)), [can]);
  const [tab, setTab] = useState<TabId>(tabs[0]?.id ?? 'users');

  return (
    <div>
      <PageHeader
        icon={<FiLock />}
        title="Access control"
        description="Decide who can sign in to this admin panel and exactly what each role is allowed to do."
      />
      <div className="settings-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'users' && <AdminUsersCard />}
      {tab === 'roles' && <RolesPanel />}
      {tab === 'audit' && <AuditLogPanel />}
    </div>
  );
}
