'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { NavItem } from './MobileNavDrawer';

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => (i.children?.length ? flatten(i.children) : [i]));
}

/**
 * Jumps to a page by nav label — not a decorative input. There's no
 * cross-entity search backend (students/staff/schools/etc.) to wire a real
 * content search to yet, so this searches what we do have in hand: the
 * signed-in portal's own nav tree, already in memory.
 */
export function TopbarSearch({ items, placeholder = 'Search pages…' }: { items: NavItem[]; placeholder?: string }) {
  const router = useRouter();
  const flat = useMemo(() => flatten(items), [items]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return flat.filter((i) => i.href && i.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, flat]);

  // "/" focuses search — the same convention GitHub/Slack use — but only
  // when focus isn't already in some other field, or every "/" typed
  // elsewhere on the page would get hijacked.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return;
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function go(item: NavItem) {
    if (!item.href) return;
    router.push(item.href);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="relative w-full max-w-xs" ref={wrapRef}>
      <div className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-bg-muted border border-transparent focus-within:border-border focus-within:bg-white transition-colors">
        <Search className="w-4 h-4 text-text-faint shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && results[activeIndex]) {
              go(results[activeIndex]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          aria-label="Search pages"
          className="flex-1 min-w-0 bg-transparent text-sm text-primary-900 placeholder:text-text-faint outline-none"
        />
        <kbd className="hidden sm:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded-md bg-white border border-border text-[10px] font-medium text-text-faint">
          /
        </kbd>
      </div>

      {open && query && (
        <div className="absolute left-0 right-0 mt-2 rounded-xl border border-border bg-white shadow-lg overflow-hidden z-50">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-text-muted">No matching pages.</p>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(item)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                    i === activeIndex ? 'bg-bg-muted' : ''
                  }`}
                >
                  <Icon className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                  <span className="text-primary-900">{item.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
