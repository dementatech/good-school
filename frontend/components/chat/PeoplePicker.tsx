'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { PersonAvatar } from './ChatAvatar';
import { chatApi } from '@/lib/communications/api';
import type { Contact } from '@/lib/communications/types';

const ROLE_FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'school_admin', label: 'Admins' },
  { value: 'student', label: 'Students' },
  { value: 'parent', label: 'Parents' },
];

/** Searches the people the signed-in user may chat with (the backend applies the rules). */
export function PeoplePicker({
  selected,
  onPick,
  multi,
  showRoleFilter,
  exclude,
}: {
  selected?: Map<string, Contact>;
  onPick: (contact: Contact) => void;
  multi?: boolean;
  showRoleFilter: boolean;
  exclude?: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const found = await chatApi.contacts(query, role || undefined);
      if (cancelled) return;
      setResults(found ?? []);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, role]);

  const visible = exclude ? results.filter((c) => !exclude.has(c.userId)) : results;

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search people</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="w-full rounded-xl border border-border bg-bg-muted py-2.5 pl-9 pr-3 text-sm focus:border-primary-700 focus:bg-white focus:outline-none"
        />
      </label>
      {showRoleFilter && (
        <div className="flex flex-wrap gap-1.5">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setRole(f.value)}
              aria-pressed={role === f.value}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                role === f.value ? 'bg-primary-700 text-white' : 'bg-bg-muted text-text-secondary hover:bg-primary-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <ul className="-mx-2 max-h-[55vh] overflow-y-auto">
        {loading && (
          <li className="flex justify-center py-6 text-text-muted">
            <Loader2 className="size-5 animate-spin" aria-label="Searching" />
          </li>
        )}
        {!loading && visible.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-text-muted">
            {query ? 'Nobody you can message matches that name.' : 'Nobody to show.'}
          </li>
        )}
        {!loading &&
          visible.map((c) => {
            const isSelected = selected?.has(c.userId) ?? false;
            return (
              <li key={`${c.schoolId}-${c.userId}`}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-muted ${isSelected ? 'bg-primary-50' : ''}`}
                  aria-pressed={multi ? isSelected : undefined}
                >
                  <PersonAvatar name={c.name} photoUrl={c.photoUrl} online={c.online} seed={c.userId} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">{c.name}</span>
                    <span className="block truncate text-xs text-text-muted">{c.subtitle}</span>
                  </span>
                  {multi && (
                    <span
                      className={`inline-flex size-5 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-primary-700 bg-primary-700 text-white' : 'border-border-strong'
                      }`}
                      aria-hidden
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
