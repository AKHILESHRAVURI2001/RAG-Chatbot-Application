import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FiLogOut, FiBox, FiSearch, FiChevronDown, FiMenu, FiX } from 'react-icons/fi';
import { authStore } from '../lib/auth';
import { useAuth } from '../lib/authContext';
import { visibleNavGroups } from '../routes';
import { SOURCE_TINT } from '../lib/sourceGradient';
import { api } from '../lib/api';
import { applyAdminTheme } from '../lib/theme';
import WidgetScript from './WidgetScript';
import { PageSpinner } from './ui/Spinner';
import Dropdown from './ui/Dropdown';



function initialsFrom(email: string): string {
  const local = email.split('@')[0] || email;
  return local.slice(0, 2).toUpperCase();
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, canAny } = useAuth();
  const navGroups = useMemo(() => visibleNavGroups(canAny), [canAny]);
  const allLinks = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const email = me.email;
  const [companyName, setCompanyName] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setCompanyName(s.widget.companyName);
        applyAdminTheme(s.widget.adminPrimaryColor);
      })
      .catch(() => {
        /* falls back to the generic app name and the CSS default color below (also what a role without settings access sees) */
      });
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const currentTitle = [...allLinks].reverse().find((l) => (l.end ? location.pathname === l.path : location.pathname.startsWith(l.path)))?.label ?? '';

  function logout() {
    authStore.clearToken();
    navigate('/login');
  }

  /** A quick jump to whichever nav section's name matches what was typed — not a full content search, just a fast way to reach a page by name instead of scanning the sidebar. */
  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match = allLinks.find((l) => l.label.toLowerCase().includes(q));
    if (match) navigate(match.path);
    setQuery('');
    setSearchOpen(false);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button
          className="topbar-hamburger-btn"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <FiX /> : <FiMenu />}
        </button>
        <div className="topbar-logo"><FiBox aria-hidden /></div>
        <div className="topbar-brand">
          <span className="topbar-company">{companyName || 'MiniChatbotAgent'}</span>
          {currentTitle && <span className="topbar-page">{currentTitle}</span>}
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-right">
          {searchOpen && (
            <form className="topbar-search-form" onSubmit={submitSearch}>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => !query && setSearchOpen(false)}
                placeholder="Jump to a section…"
              />
            </form>
          )}
          <button className="topbar-search-btn" onClick={() => setSearchOpen((v) => !v)} aria-label="Search" title="Jump to a section">
            <FiSearch aria-hidden />
          </button>
          <Dropdown
            className="topbar-menu"
            panelClassName="topbar-menu-panel"
            trigger={
              <button className="topbar-menu-trigger" aria-label="Account menu">
                <span className="topbar-avatar">{initialsFrom(email || '??')}</span>
                <FiChevronDown aria-hidden className="topbar-menu-caret" />
              </button>
            }
          >
            <div className="topbar-menu-email">{email || '…'}</div>
            <div className="topbar-menu-role">{me.role.name}</div>
            <button className="topbar-menu-item" onClick={logout}>
              <FiLogOut aria-hidden /> Log out
            </button>
          </Dropdown>
        </div>
      </header>
      <div className="shell-body">
        {mobileMenuOpen && (
          <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
        )}
        <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <nav>
            {navGroups.map((group, groupIdx) => (
              <div key={group.title} className="nav-group">
                {groupIdx > 0 && <div className="nav-divider" />}
                <div className="nav-group-title">{group.title}</div>
                {group.items.map((l) => (
                  <NavLink
                    key={l.path}
                    to={l.path}
                    end={l.end}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${l.source ? ' has-accent' : ''}`}
                    style={l.source ? ({ '--nav-accent': SOURCE_TINT[l.source] } as React.CSSProperties) : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    title={l.label}
                  >
                    <l.icon aria-hidden />
                    <span>{l.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="content">
          <Suspense fallback={<PageSpinner label="Loading…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <WidgetScript />
    </div>
  );
}
