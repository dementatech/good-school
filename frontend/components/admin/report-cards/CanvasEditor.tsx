'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, Copy, Plus, Trash2 } from 'lucide-react';
import { CanvasBlockContent, type CardParts } from './ReportCardSheet';
import {
  BLOCK_INFO,
  BLOCK_TYPES,
  PAGE_MM,
  PLACEHOLDERS,
  PX_PER_MM,
  newBlockId,
  templateVars,
  type BlockType,
  type CanvasBlock,
  type TemplateDesign,
} from './templates';

// The page editor: an A4 page where every part of the report card is a block
// the school drags into place and resizes. Positions are in millimetres, so
// what's laid out here is exactly where it prints. Blocks snap to a 1 mm grid;
// arrow keys nudge the selected block (Shift for 5 mm), Delete removes it.

const SNAP = 1;
const snap = (n: number) => Math.round(n / SNAP) * SNAP;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

type Drag = {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origin: CanvasBlock;
};

export function CanvasEditor({
  design,
  parts,
  onChange,
}: {
  design: TemplateDesign;
  /** A real learner's card, so blocks show what they'll print. */
  parts: CardParts | null;
  onChange: (blocks: CanvasBlock[]) => void;
}) {
  const blocks = design.blocks ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // Fit the page to the space available.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1.2, el.clientWidth / (PAGE_MM.width * PX_PER_MM)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function update(id: string, patch: Partial<CanvasBlock>) {
    onChange(
      blocks.map((b) => {
        if (b.id !== id) return b;
        const next = { ...b, ...patch };
        next.w = clamp(next.w, 2, PAGE_MM.width);
        next.h = clamp(next.h, 0.5, PAGE_MM.height);
        next.x = clamp(next.x, 0, PAGE_MM.width - next.w);
        next.y = clamp(next.y, 0, PAGE_MM.height - next.h);
        return next;
      }),
    );
  }
  function updateProps(id: string, patch: CanvasBlock['props']) {
    const b = blocks.find((x) => x.id === id);
    if (b) update(id, { props: { ...b.props, ...patch } });
  }
  function remove(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
    setSelectedId(null);
  }
  function add(type: BlockType) {
    const info = BLOCK_INFO[type];
    const block: CanvasBlock = {
      id: newBlockId(type),
      type,
      x: snap((PAGE_MM.width - info.w) / 2),
      y: 20,
      w: info.w,
      h: info.h,
      props: type === 'text' ? { text: 'Your text', size: 11, align: 'left', color: '#1F2937' } : {},
    };
    onChange([...blocks, block]);
    setSelectedId(block.id);
  }
  function duplicate(id: string) {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const copy = { ...b, id: newBlockId(b.type), x: clamp(b.x + 5, 0, PAGE_MM.width - b.w), y: clamp(b.y + 5, 0, PAGE_MM.height - b.h) };
    onChange([...blocks, copy]);
    setSelectedId(copy.id);
  }
  function reorder(id: string, toFront: boolean) {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const rest = blocks.filter((x) => x.id !== id);
    onChange(toFront ? [...rest, b] : [b, ...rest]);
  }

  function startDrag(e: React.PointerEvent, block: CanvasBlock, mode: Drag['mode']) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(block.id);
    dragRef.current = { id: block.id, mode, startX: e.clientX, startY: e.clientY, origin: block };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / (PX_PER_MM * scale);
    const dy = (e.clientY - drag.startY) / (PX_PER_MM * scale);
    const o = drag.origin;
    if (drag.mode === 'move') update(drag.id, { x: snap(o.x + dx), y: snap(o.y + dy) });
    else update(drag.id, { w: snap(Math.max(2, o.w + dx)), h: Math.max(0.5, snap(o.h + dy)) });
  }
  function endDrag() {
    dragRef.current = null;
  }

  // Keyboard: nudge, delete, deselect — only while the page has focus.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      const id = selectedId;
      if (!id) return;
      const b = blocks.find((x) => x.id === id);
      if (!b) return;
      const step = e.shiftKey ? 5 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        update(id, { x: b.x + moves[e.key][0], y: b.y + moves[e.key][1] });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(id);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    }
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, blocks]);

  const present = new Set(blocks.map((b) => b.type));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4 items-start">
      <div className="space-y-2 min-w-0">
        <p className="text-xs text-text-muted">
          Drag a block to move it, and its corner to resize. Arrow keys nudge the selected block (Shift for 5 mm); Delete
          removes it. The results table grows with the subject list and pushes what&apos;s below it down.
        </p>
        <div
          ref={wrapRef}
          tabIndex={0}
          className="rounded-card border border-border bg-bg-canvas p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          onPointerDown={() => setSelectedId(null)}
        >
          <div style={{ height: `${PAGE_MM.height * PX_PER_MM * scale}px` }}>
            <div
              className="relative bg-white shadow-sm origin-top-left select-none"
              style={{
                ...templateVars(design.style),
                width: `${PAGE_MM.width}mm`,
                height: `${PAGE_MM.height}mm`,
                transform: `scale(${scale})`,
                backgroundImage:
                  'linear-gradient(to right, rgba(46,119,174,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(46,119,174,0.06) 1px, transparent 1px)',
                backgroundSize: '10mm 10mm',
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {blocks.map((b) => {
                const isSelected = b.id === selectedId;
                return (
                  <div
                    key={b.id}
                    onPointerDown={(e) => startDrag(e, b, 'move')}
                    className={`absolute cursor-move overflow-hidden ${
                      isSelected ? 'outline-2 outline-primary-700 z-10' : 'outline-1 outline-dashed outline-primary-200 hover:outline-primary-500'
                    }`}
                    style={{ left: `${b.x}mm`, top: `${b.y}mm`, width: `${b.w}mm`, height: `${b.h}mm`, outlineStyle: isSelected ? 'solid' : undefined }}
                    title={BLOCK_INFO[b.type].label}
                  >
                    <div className="pointer-events-none w-full h-full">
                      {parts ? (
                        <CanvasBlockContent block={b} parts={parts} />
                      ) : (
                        <span className="text-[10px] text-text-faint">{BLOCK_INFO[b.type].label}</span>
                      )}
                    </div>
                    {isSelected && (
                      <span
                        onPointerDown={(e) => startDrag(e, b, 'resize')}
                        className="absolute right-0 bottom-0 w-3 h-3 bg-primary-700 cursor-nwse-resize"
                        aria-label="Resize"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4">
        <div className="rounded-card border border-border bg-bg-card p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-faint mb-2">Add a block</p>
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_TYPES.map((type) => {
              const info = BLOCK_INFO[type];
              const disabled = !!info.single && present.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  onClick={() => add(type)}
                  title={info.hint || info.label}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-primary-900 hover:bg-primary-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Plus className="w-3 h-3" aria-hidden /> {info.label}
                </button>
              );
            })}
          </div>
        </div>

        {selected ? (
          <BlockPanel
            block={selected}
            onChange={(patch) => update(selected.id, patch)}
            onProps={(patch) => updateProps(selected.id, patch)}
            onDelete={() => remove(selected.id)}
            onDuplicate={() => duplicate(selected.id)}
            onFront={() => reorder(selected.id, true)}
            onBack={() => reorder(selected.id, false)}
          />
        ) : (
          <p className="text-xs text-text-muted px-1">Select a block on the page to change its size, position and look.</p>
        )}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-text-muted mb-0.5">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full h-8 rounded-md border border-border-strong px-2 text-sm tabular-nums"
      />
    </label>
  );
}

function ColorField({ label, value, onChange, allowNone = false }: { label: string; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const isAccent = value === 'accent';
  return (
    <div>
      <span className="block text-[11px] text-text-muted mb-0.5">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isAccent || !value ? '#2E77AE' : value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 rounded border border-border-strong"
          aria-label={label}
        />
        {!allowNone && (
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            <input type="checkbox" checked={isAccent} onChange={(e) => onChange(e.target.checked ? 'accent' : '#1F2937')} />
            Template colour
          </label>
        )}
        {allowNone && (
          <button type="button" onClick={() => onChange('')} className="text-xs text-primary-700 underline">
            None
          </button>
        )}
      </div>
    </div>
  );
}

const ALIGNABLE: BlockType[] = ['schoolName', 'schoolDetails', 'examTitle', 'issuedDate', 'footerNote', 'text'];

function BlockPanel({
  block,
  onChange,
  onProps,
  onDelete,
  onDuplicate,
  onFront,
  onBack,
}: {
  block: CanvasBlock;
  onChange: (patch: Partial<CanvasBlock>) => void;
  onProps: (patch: CanvasBlock['props']) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFront: () => void;
  onBack: () => void;
}) {
  const info = BLOCK_INFO[block.type];
  const p = block.props;
  return (
    <div className="rounded-card border border-border bg-bg-card p-3 space-y-3">
      <div>
        <p className="text-sm font-bold text-primary-900">{info.label}</p>
        {info.hint && <p className="text-xs text-text-muted">{info.hint}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Left (mm)" value={block.x} onChange={(x) => onChange({ x })} />
        <NumberField label="Top (mm)" value={block.y} onChange={(y) => onChange({ y })} />
        <NumberField label="Width (mm)" value={block.w} onChange={(w) => onChange({ w })} min={2} />
        <NumberField label="Height (mm)" value={block.h} onChange={(h) => onChange({ h })} min={0.5} step={0.5} />
      </div>

      {block.type === 'text' && (
        <div className="space-y-2">
          <label className="block">
            <span className="block text-[11px] text-text-muted mb-0.5">Text</span>
            <textarea
              value={String(p.text ?? '')}
              maxLength={600}
              rows={4}
              onChange={(e) => onProps({ text: e.target.value })}
              className="w-full rounded-md border border-border-strong px-2 py-1.5 text-sm"
            />
          </label>
          <p className="text-[11px] text-text-faint leading-snug">
            Fills in: {PLACEHOLDERS.map((x) => x.token).join(' ')}
          </p>
          <NumberField label="Size (pt)" value={Number(p.size ?? 11)} onChange={(size) => onProps({ size: clamp(size, 6, 48) })} min={6} max={48} />
          <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
            {(['bold', 'italic', 'uppercase'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 capitalize">
                <input type="checkbox" checked={!!p[k]} onChange={(e) => onProps({ [k]: e.target.checked })} /> {k}
              </label>
            ))}
          </div>
          <ColorField label="Colour" value={String(p.color ?? '#1F2937')} onChange={(color) => onProps({ color })} />
        </div>
      )}

      {block.type === 'schoolName' && (
        <NumberField label="Size (pt)" value={Number(p.size ?? 18)} onChange={(size) => onProps({ size: clamp(size, 6, 48) })} min={6} max={48} />
      )}

      {ALIGNABLE.includes(block.type) && (
        <div>
          <span className="block text-[11px] text-text-muted mb-0.5">Alignment</span>
          <div className="inline-flex rounded-md border border-border-strong overflow-hidden">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onProps({ align: a })}
                className={`px-2.5 h-8 text-xs capitalize ${p.align === a || (!p.align && a === 'left') ? 'bg-primary-700 text-white' : 'text-primary-900'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {block.type === 'line' && (
        <div className="space-y-2">
          <NumberField label="Thickness (px)" value={Number(p.thickness ?? 1)} onChange={(thickness) => onProps({ thickness: clamp(thickness, 0.5, 6) })} step={0.5} />
          <ColorField label="Colour" value={String(p.color ?? 'accent')} onChange={(color) => onProps({ color })} />
        </div>
      )}

      {block.type === 'box' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Border (px)" value={Number(p.thickness ?? 1)} onChange={(thickness) => onProps({ thickness: clamp(thickness, 0, 6) })} />
            <NumberField label="Rounding (mm)" value={Number(p.radius ?? 0)} onChange={(radius) => onProps({ radius: clamp(radius, 0, 20) })} />
          </div>
          <ColorField label="Border colour" value={String(p.color ?? 'accent')} onChange={(color) => onProps({ color })} />
          <ColorField label="Fill" value={String(p.fill ?? '')} onChange={(fill) => onProps({ fill })} allowNone />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
        <IconButton label="Duplicate" onClick={onDuplicate} icon={Copy} />
        <IconButton label="Bring to front" onClick={onFront} icon={ArrowUpToLine} />
        <IconButton label="Send to back" onClick={onBack} icon={ArrowDownToLine} />
        <IconButton label="Delete" onClick={onDelete} icon={Trash2} danger />
      </div>
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon, danger }: { label: string; onClick: () => void; icon: React.ElementType; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md border px-2 h-8 text-xs ${
        danger ? 'border-error text-error hover:bg-error-bg' : 'border-border-strong text-primary-900 hover:bg-primary-50'
      }`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden /> {label}
    </button>
  );
}
