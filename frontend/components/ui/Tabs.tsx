'use client';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

/**
 * Underlined tab bar — the pattern already established in
 * LibraryBrowse.tsx, factored out once a third page (Organisation Studio's
 * two tab groups, then the Staff page) needed the same thing. Purely a
 * display switch: the caller owns which key is active and what filtering it
 * implies.
 */
export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border">
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              selected ? 'border-primary-700 text-primary-900' : 'border-transparent text-text-muted hover:text-primary-900'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 text-xs ${selected ? 'text-primary-700' : 'text-text-muted/70'}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
