'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

// Ribbon building blocks, after the Office ribbon: a group is a labelled
// column of commands; large buttons carry an icon over a label, small ones sit
// three to a column; split/drop buttons open a menu.

export function RibbonGroup({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col shrink-0 px-2 border-r border-border last:border-r-0 ${className}`}>
      <div className="flex items-stretch gap-1 flex-1 min-h-[64px]">{children}</div>
      <p className="text-[10px] text-text-muted text-center pt-0.5 select-none whitespace-nowrap">{label}</p>
    </div>
  );
}

export function RibbonColumn({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col justify-center gap-0.5">{children}</div>;
}

interface ButtonProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  /** Shown on hover, with the shortcut. */
  title?: string;
}

export function LargeButton({ icon: Icon, label, onClick, disabled, active, title }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex flex-col items-center justify-start gap-1 w-[60px] px-1 pt-1.5 pb-1 rounded-md text-[11px] leading-tight text-primary-900 hover:bg-primary-50 disabled:opacity-40 disabled:hover:bg-transparent ${
        active ? 'bg-primary-100 ring-1 ring-primary-200' : ''
      }`}
    >
      <Icon className="w-6 h-6 text-primary-700" aria-hidden />
      <span className="text-center">{label}</span>
    </button>
  );
}

export function SmallButton({ icon: Icon, label, onClick, disabled, active, title, iconOnly }: ButtonProps & { iconOnly?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={iconOnly ? label : undefined}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 h-6 px-1.5 rounded text-[12px] text-primary-900 hover:bg-primary-50 disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap ${
        active ? 'bg-primary-100 ring-1 ring-primary-200' : ''
      }`}
    >
      <Icon className="w-4 h-4 text-primary-700 shrink-0" aria-hidden />
      {!iconOnly && label}
    </button>
  );
}

export function RibbonSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  width = 'w-32',
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  width?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-primary-900" title={label}>
      <span className="text-text-muted whitespace-nowrap">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${width} h-6 rounded border border-border-strong bg-white px-1 text-[12px] disabled:opacity-40`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RibbonColor({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-1.5 text-[12px] text-primary-900 ${disabled ? 'opacity-40' : ''}`} title={label}>
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#2E77AE'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-7 rounded border border-border-strong p-0"
      />
      <span className="whitespace-nowrap">{label}</span>
    </label>
  );
}

export interface MenuItem {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  group?: string;
}

/** A large ribbon button that drops down a menu (e.g. Data field ▾). */
export function DropButton({ icon: Icon, label, items, disabled }: { icon: React.ElementType; label: string; items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const groups = [...new Set(items.map((i) => i.group ?? ''))];
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => {
          const r = ref.current!.getBoundingClientRect();
          setPos({ left: r.left, top: r.bottom + 2 });
          setOpen((o) => !o);
        }}
        className={`flex flex-col items-center justify-start gap-1 w-[64px] px-1 pt-1.5 pb-1 rounded-md text-[11px] leading-tight text-primary-900 hover:bg-primary-50 disabled:opacity-40 ${
          open ? 'bg-primary-100' : ''
        }`}
      >
        <Icon className="w-6 h-6 text-primary-700" aria-hidden />
        <span className="inline-flex items-center gap-0.5">
          {label}
          <ChevronDown className="w-3 h-3" aria-hidden />
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[70] min-w-56 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg"
            style={{ left: pos.left, top: pos.top }}
          >
            {groups.map((g) => (
              <div key={g}>
                {g && <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-faint">{g}</p>}
                {items
                  .filter((i) => (i.group ?? '') === g)
                  .map((i) => (
                    <button
                      key={i.label}
                      type="button"
                      role="menuitem"
                      disabled={i.disabled}
                      onClick={() => {
                        setOpen(false);
                        i.onClick();
                      }}
                      className="block w-full text-left px-3 py-1 text-[12px] text-primary-900 hover:bg-primary-50 disabled:opacity-40"
                    >
                      {i.label}
                      {i.hint && <span className="block text-[10px] text-text-muted">{i.hint}</span>}
                    </button>
                  ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary-700' : 'bg-bg-muted border border-border-strong'
      }`}
    >
      <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[14px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function CheckRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-1.5 text-[12px] text-primary-900 whitespace-nowrap ${disabled ? 'opacity-40' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="rounded border-border" />
      {label}
    </label>
  );
}
