'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import type { NavItem } from './MobileNavDrawer';

const STORAGE_KEY = 'school_os_sidebar_collapsed';

function isActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : (item.activePrefixes ?? [item.href]).some((prefix) => pathname.startsWith(prefix));
}

/**
 * Hover label for a collapsed icon-only nav item. Rendered through a portal
 * and pinned to the trigger's rect — the same fix `DropdownMenu` uses for the
 * same problem: the sidebar `<nav>` is `overflow-y-auto`, and per the CSS
 * spec that forces the x-axis to clip too, so an absolutely-positioned child
 * would get cut off at the sidebar's own edge instead of floating over the
 * page.
 */
function IconTooltip({ anchor, label }: { anchor: HTMLElement; label: string }) {
  const rect = anchor.getBoundingClientRect();
  return createPortal(
    <div
      role="tooltip"
      className="fixed z-[100] px-2.5 py-1.5 rounded-lg bg-[#0f172a] text-white text-xs font-medium shadow-lg pointer-events-none whitespace-nowrap"
      style={{ top: rect.top + rect.height / 2, left: rect.right + 8, transform: 'translateY(-50%)' }}
    >
      {label}
    </div>,
    document.body,
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  // The anchor element itself, captured from the hover event rather than read
  // off a ref during render (React refs must not be read while rendering).
  const [hoverAnchor, setHoverAnchor] = useState<HTMLElement | null>(null);

  return (
    <div
      className="relative"
      onMouseEnter={(e) => setHoverAnchor(e.currentTarget)}
      onMouseLeave={() => setHoverAnchor(null)}
    >
      <Link
        href={item.href}
        aria-label={collapsed ? item.label : undefined}
        className={`flex items-center gap-3 rounded-lg text-sm transition-colors ${
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
        } ${
          active ? 'bg-white/15 text-white font-medium' : 'text-primary-100 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Icon className="w-4.5 h-4.5 shrink-0" aria-hidden />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
      {collapsed && hoverAnchor && <IconTooltip anchor={hoverAnchor} label={item.label} />}
    </div>
  );
}

export interface PortalSidebarProps {
  /** Two-letter mark shown in the brand box, e.g. "TC". */
  brandInitials: string;
  /** Full portal name, e.g. "Good School". */
  brandLabel: string;
  subtitle?: string | null;
  nav: NavItem[];
  /** Admin's "System" block — only rendered when given. */
  secondaryNav?: { label: string; items: NavItem[] };
  /** Own-account links pinned above Sign out. */
  footerNav?: NavItem[];
  onSignOut: () => void;
}

/**
 * The desktop sidebar shared by every portal — filled with the brand color,
 * collapsible to an icon+tooltip rail (collapsed by default; the choice is
 * remembered per browser via localStorage). Mobile keeps its own off-canvas
 * `MobileNavDrawer`, fed the same `nav`/`secondaryNav`/`footerNav` data, so
 * there is exactly one nav-item list per portal either way.
 */
export function PortalSidebar({
  brandInitials,
  brandLabel,
  subtitle,
  nav,
  secondaryNav,
  footerNav = [],
  onSignOut,
}: PortalSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === '1');
    } catch {
      // Storage disabled (private browsing) — falls back to the collapsed default.
    }
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Nothing to persist to; the toggle still works for this page view.
      }
      return next;
    });
  }

  // Starts collapsed (the default) until localStorage is read, so a fresh
  // visitor never sees an expanded flash; a returning viewer who chose
  // "expanded" gets it animated open once hydration runs.
  const width = !ready || collapsed ? 'w-16' : 'w-60';

  return (
    <aside
      className={`${width} relative shrink-0 bg-primary-700 hidden md:flex flex-col sticky top-0 h-screen transition-[width] duration-150 print:hidden`}
    >
      {/* Edge toggle — the standard "collapse this panel" affordance, pinned to
          the sidebar's right edge so it's visible in both states and never
          eats a nav row. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
        title={collapsed ? 'Expand menu' : 'Collapse menu'}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-white text-primary-700 border border-primary-200 shadow-sm flex items-center justify-center hover:bg-primary-50 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" aria-hidden /> : <ChevronLeft className="w-3.5 h-3.5" aria-hidden />}
      </button>

      <div className={`flex items-center gap-3 border-b border-white/10 ${collapsed ? 'justify-center p-3' : 'p-5'}`}>
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">{brandInitials}</span>
        </div>
        {ready && !collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{brandLabel}</p>
            {subtitle && <p className="text-xs text-primary-100 truncate">{subtitle}</p>}
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item, pathname)} collapsed={collapsed} />
        ))}

        {secondaryNav && secondaryNav.items.length > 0 && (
          <>
            {!collapsed ? (
              <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-primary-200">
                {secondaryNav.label}
              </p>
            ) : (
              <div className="my-2 border-t border-white/10" role="separator" aria-label={secondaryNav.label} />
            )}
            {secondaryNav.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item, pathname)} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        {footerNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item, pathname)} collapsed={collapsed} />
        ))}

        <button
          type="button"
          onClick={onSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg text-sm text-red-200 hover:bg-white/10 hover:text-red-100 transition-colors ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" aria-hidden />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
