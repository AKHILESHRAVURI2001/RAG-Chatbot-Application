import type { ReactNode } from 'react';

export interface CategoryTab {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface Category {
  id: string;
  label: string;
  icon?: ReactNode;
  tabs: CategoryTab[];
}

interface CategoryNavProps {
  categories: Category[];
  category: string;
  tab: string;
  onSelectCategory: (id: string) => void;
  onSelectTab: (id: string) => void;
  /** The selected tab's content — rendered below the sub-tab row, in the right column. */
  children: ReactNode;
}

/**
 * The two-level "pick a category, then a tab within it" chrome shared by
 * every settings-shaped page in the admin (first built for Settings itself,
 * see pages/Settings.tsx) — a vertical card-styled category list on the
 * left, a horizontal sub-tab row for the selected category's own tabs on
 * the right, and the caller's content for the selected tab below that.
 * Purely presentational: selection state and what each tab renders both
 * live in the calling page.
 */
export default function CategoryNav({ categories, category, tab, onSelectCategory, onSelectTab, children }: CategoryNavProps) {
  const current = categories.find((c) => c.id === category);
  return (
    <div className="split-columns">
      <div className="column">
        <nav className="settings-category-nav">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`settings-category-item ${category === c.id ? 'active' : ''}`}
              onClick={() => onSelectCategory(c.id)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="column">
        {current && current.tabs.length > 1 && (
          <div className="settings-tabs">
            {current.tabs.map((t) => (
              <button key={t.id} className={`settings-tab ${tab === t.id ? 'active' : ''}`} onClick={() => onSelectTab(t.id)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
