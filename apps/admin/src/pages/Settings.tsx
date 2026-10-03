import { useEffect, useState } from 'react';
import { FiCode, FiShield, FiUsers, FiPlay, FiPenTool, FiMessageCircle, FiZap, FiPower, FiClock, FiDatabase, FiHardDrive, FiBox, FiLock, FiUserCheck } from 'react-icons/fi';
import type {
  WidgetSettings,
  BusinessHoursSettings,
  CacheSettings,
  LimitsSettings,
  ChunkingSettings,
  DocumentDTO,
  Permission,
} from '../shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/authContext';
import { applyAdminTheme } from '../lib/theme';
import { ReadOnlyGuard } from '../components/ReadOnlyGuard';
import VisitorUsersCard from '../components/VisitorUsersCard';
import QueryToolCard from '../components/QueryToolCard';
import DatabaseCard from '../components/DatabaseCard';
import { PageSpinner } from '../components/ui/Spinner';
import AdminBrandingTab from '../components/settings/AdminBrandingTab';
import HostApiTab from '../components/settings/HostApiTab';
import ScopeTab from '../components/settings/ScopeTab';
import WidgetBasicTab from '../components/settings/WidgetBasicTab';
import ColorIconTab from '../components/settings/ColorIconTab';
import QuickRepliesTab from '../components/settings/QuickRepliesTab';
import ProactiveOpenTab from '../components/settings/ProactiveOpenTab';
import AvailabilityTab from '../components/settings/AvailabilityTab';
import AuthGateTab from '../components/settings/AuthGateTab';
import BusinessHoursTab from '../components/settings/BusinessHoursTab';
import CachingTab from '../components/settings/CachingTab';
import UsageLimitsTab from '../components/settings/UsageLimitsTab';
import PageHeader from '../components/ui/PageHeader';
import { toast } from '../components/ui/Toast';

const WIDGET_HOST_KEY = 'mcb_widget_host_url';
const API_URL_KEY = 'mcb_embed_api_url';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

const CATEGORIES = [
  {
    id: 'general', label: 'General', icon: FiCode,
    tabs: [
      { id: 'adminBranding', label: 'Admin Panel', icon: FiBox },
      { id: 'hostApi', label: 'Host & API', icon: FiCode },
      { id: 'scope', label: 'Scope', icon: FiCode },
    ],
  },
  {
    id: 'widget', label: 'Widget', icon: FiPenTool,
    tabs: [
      { id: 'widgetBasic', label: 'Widget Basics', icon: FiPenTool },
      { id: 'colorIcon', label: 'Color & Icon', icon: FiPenTool },
      { id: 'quickReplies', label: 'Quick Replies', icon: FiMessageCircle },
      { id: 'proactiveOpen', label: 'Proactive Open', icon: FiZap },
      { id: 'authGate', label: 'Sign Up / Login Gate', icon: FiLock },
      { id: 'availability', label: 'Availability', icon: FiPower },
      { id: 'businessHours', label: 'Business Hours', icon: FiClock },
    ],
  },
  {
    id: 'advanced', label: 'Advanced', icon: FiShield,
    tabs: [
      { id: 'caching', label: 'Caching', icon: FiDatabase },
      { id: 'usageLimits', label: 'Usage Limits', icon: FiShield },
    ],
  },
  {
    id: 'admin', label: 'Admin', icon: FiUsers,
    tabs: [
      { id: 'visitorUsers', label: 'Chat Users (Visitors)', icon: FiUserCheck },
      { id: 'query', label: 'SQL Query', icon: FiPlay },
      { id: 'database', label: 'Database', icon: FiHardDrive },
    ],
  },
] as const;
type CategoryId = (typeof CATEGORIES)[number]['id'];
type TabId = (typeof CATEGORIES)[number]['tabs'][number]['id'];

/** Tabs that manage something other than plain settings need their own permission to be shown (the server enforces the same). */
const TAB_PERMISSION: Partial<Record<TabId, Permission>> = {
  visitorUsers: 'visitors.view',
  query: 'query.run',
};
/** Tabs with their own self-contained controls, which gate themselves instead of being wrapped read-only as a whole. */
const SELF_GUARDED_TABS: readonly TabId[] = ['visitorUsers', 'query', 'database'];

function isValidHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function Settings() {
  const { can } = useAuth();
  const [widget, setWidget] = useState<WidgetSettings | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHoursSettings | null>(null);
  const [cache, setCache] = useState<CacheSettings | null>(null);
  const [limits, setLimits] = useState<LimitsSettings | null>(null);
  const [chunking, setChunking] = useState<ChunkingSettings | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [widgetHostUrl, setWidgetHostUrl] = useState(() => {
    try {
      return localStorage.getItem(WIDGET_HOST_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [copied, setCopied] = useState(false);
  const [apiUrlOverride, setApiUrlOverride] = useState(() => {
    try {
      return localStorage.getItem(API_URL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [category, setCategory] = useState<CategoryId>('general');
  const [tab, setTab] = useState<TabId>('adminBranding');

  /** Only the tabs this user may open; a category with none left disappears from the menu. */
  const tabsOf = (c: (typeof CATEGORIES)[number]) => c.tabs.filter((t) => !TAB_PERMISSION[t.id as TabId] || can(TAB_PERMISSION[t.id as TabId]!));
  const visibleCategories = CATEGORIES.filter((c) => tabsOf(c).length > 0);

  function selectCategory(c: CategoryId) {
    setCategory(c);
    setTab(tabsOf(CATEGORIES.find((cat) => cat.id === c)!)[0].id);
  }
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagCopied, setTagCopied] = useState(false);
  const [docCopied, setDocCopied] = useState(false);
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('');

  function refreshSettings() {
    return api.getSettings().then((s) => {
      setWidget(s.widget);
      setBusinessHours(s.businessHours);
      setCache(s.cache);
      setLimits(s.limits);
      setChunking(s.chunking);
      if (s.widget?.primaryColor) {
        document.documentElement.style.setProperty('--mcb-primary', s.widget.primaryColor);
        window.dispatchEvent(
          new CustomEvent('mcb:config-update', {
            detail: { primaryColor: s.widget.primaryColor, icon: s.widget.icon, iconSvg: s.widget.iconSvg },
          })
        );
      }
    });
  }

  useEffect(() => {
    refreshSettings().catch((e) => toast.error(e.message ?? 'Failed to load settings.'));
    api.listAllTags().then(setAllTags).catch(() => {
      /* the scoping example below just falls back to a placeholder tag name */
    });
    api
      .listDocuments()
      .then((docs) => {
        setDocuments(docs);
        if (docs.length > 0) setSelectedDocId(docs[0].id);
      })
      .catch(() => {
        /* the "by document" scope example below just falls back to a placeholder id */
      });
  }, []);

  async function save<T>(fn: (v: T) => Promise<T>, value: T, label: string) {
    try {
      await fn(value);
      toast.success(`${label} saved successfully.`);
    } catch (e: any) {
      toast.error(e.message ?? `Failed to save ${label.toLowerCase()}.`);
    }
  }

  async function saveBranding() {
    if (!widget) return;
    try {
      await api.updateWidget(widget);
      applyAdminTheme(widget.adminPrimaryColor);
      toast.success('Branding saved successfully.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save branding.');
    }
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const updated = await api.uploadWidgetIcon(file);
      setWidget(updated);
      toast.success('Icon uploaded.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to upload icon.');
    } finally {
      setUploadingIcon(false);
      e.target.value = '';
    }
  }

  async function handleIconRemove() {
    try {
      const updated = await api.removeWidgetIcon();
      setWidget(updated);
      toast.success('Custom icon removed — back to the emoji.');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to remove icon.');
    }
  }

  function updateWidgetHostUrl(value: string) {
    setWidgetHostUrl(value);
    try {
      localStorage.setItem(WIDGET_HOST_KEY, value);
    } catch {
      /* ignore */
    }
  }

  function updateApiUrlOverride(value: string) {
    setApiUrlOverride(value);
    try {
      localStorage.setItem(API_URL_KEY, value);
    } catch {
      /* ignore */
    }
  }

  const effectiveApiUrl = apiUrlOverride || API_BASE_URL;
  const widgetSrc = widgetHostUrl || 'https://YOUR-WIDGET-HOST/widget.js';
  const embedSnippet = `<script src="${widgetSrc}" data-api="${effectiveApiUrl}" defer></script>`;
  const exampleTag = allTags[0] ?? 'buying';
  const tagScopedSnippet = `<script src="${widgetSrc}" data-api="${effectiveApiUrl}" data-tag="${exampleTag}" defer></script>`;
  const docScopedSnippet = `<script src="${widgetSrc}" data-api="${effectiveApiUrl}" data-document-id="${selectedDocId || 'PASTE-DOCUMENT-ID-HERE'}" defer></script>`;

  async function copyToClipboard(text: string, setCopiedFlag: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2000);
    } catch {
      /* clipboard API unavailable — the snippet is still visible to select/copy by hand */
    }
  }

  const copySnippet = () => copyToClipboard(embedSnippet, setCopied);

  if (!widget || !businessHours || !cache || !limits || !chunking) return <PageSpinner label="Loading settings…" />;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure general settings, widget appearance, caching, limits, and chat users."
      />

      <div className="split-columns">
        <div className="column">
          <nav className="settings-category-nav">
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                className={`settings-category-item ${category === c.id ? 'active' : ''}`}
                onClick={() => selectCategory(c.id)}
              >
                <c.icon /> {c.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="column">
      <div className="settings-tabs">
        {tabsOf(CATEGORIES.find((c) => c.id === category)!).map((t) => (
          <button key={t.id} className={`settings-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon /> {t.label}
          </button>
        ))}
      </div>

      {!SELF_GUARDED_TABS.includes(tab) && (
        <ReadOnlyGuard permission="settings.edit">
        {tab === 'adminBranding' && <AdminBrandingTab widget={widget} setWidget={setWidget} onSave={saveBranding} />}

        {tab === 'hostApi' && (
          <HostApiTab
            widgetHostUrl={widgetHostUrl}
            updateWidgetHostUrl={updateWidgetHostUrl}
            apiUrlOverride={apiUrlOverride}
            updateApiUrlOverride={updateApiUrlOverride}
            apiBaseUrl={API_BASE_URL}
            isValidHttpUrl={isValidHttpUrl}
            embedSnippet={embedSnippet}
            copied={copied}
            onCopy={copySnippet}
          />
        )}

        {tab === 'scope' && (
          <ScopeTab
            allTags={allTags}
            tagScopedSnippet={tagScopedSnippet}
            tagCopied={tagCopied}
            onCopyTag={() => copyToClipboard(tagScopedSnippet, setTagCopied)}
            documents={documents}
            selectedDocId={selectedDocId}
            setSelectedDocId={setSelectedDocId}
            docScopedSnippet={docScopedSnippet}
            docCopied={docCopied}
            onCopyDoc={() => copyToClipboard(docScopedSnippet, setDocCopied)}
          />
        )}

        {tab === 'widgetBasic' && (
          <WidgetBasicTab widget={widget} setWidget={setWidget} onSave={() => save(api.updateWidget, widget, 'Widget settings')} />
        )}

        {tab === 'colorIcon' && (
          <ColorIconTab
            widget={widget}
            setWidget={setWidget}
            onSave={() => save(api.updateWidget, widget, 'Widget settings')}
            uploadingIcon={uploadingIcon}
            onIconUpload={handleIconUpload}
            onIconRemove={handleIconRemove}
          />
        )}

        {tab === 'quickReplies' && (
          <QuickRepliesTab
            widget={widget}
            setWidget={setWidget}
            onSave={() =>
              save(api.updateWidget, { ...widget, quickReplies: widget.quickReplies.filter((qr) => qr.label.trim() && qr.message.trim()) }, 'Quick replies')
            }
          />
        )}

        {tab === 'proactiveOpen' && (
          <ProactiveOpenTab widget={widget} setWidget={setWidget} onSave={() => save(api.updateWidget, widget, 'Proactive open settings')} />
        )}

        {tab === 'authGate' && (
          <AuthGateTab widget={widget} setWidget={setWidget} onSave={() => save(api.updateWidget, widget, 'Sign up / Login gate')} />
        )}

        {tab === 'availability' && (
          <AvailabilityTab widget={widget} setWidget={setWidget} onSave={() => save(api.updateWidget, widget, 'Widget settings')} />
        )}

        {tab === 'businessHours' && (
          <BusinessHoursTab
            businessHours={businessHours}
            setBusinessHours={setBusinessHours}
            onSave={() => save(api.updateBusinessHours, businessHours, 'Business hours')}
          />
        )}

        {tab === 'caching' && (
          <CachingTab
            cache={cache}
            setCache={setCache}
            onSave={() => save(api.updateCache, cache, 'Cache settings')}
            onFlush={() => api.flushCache().then(() => toast.success('Cache flushed.'))}
          />
        )}

        {tab === 'usageLimits' && (
          <UsageLimitsTab limits={limits} setLimits={setLimits} onSave={() => save(api.updateLimits, limits, 'Usage limits')} />
        )}
        </ReadOnlyGuard>
      )}
      {tab === 'visitorUsers' && <VisitorUsersCard />}
      {tab === 'query' && <QueryToolCard />}
      {tab === 'database' && <DatabaseCard />}
        </div>
      </div>
    </div>
  );
}
