'use client';

import { useRef } from 'react';
import { EyeOff } from 'lucide-react';
import { CanvasBlockContent, blockVisible, type CardParts } from '../ReportCardSheet';
import { BLOCK_INFO, DATA_FIELD, OP_LABEL, PAGE_MM, PX_PER_MM, templateVars, type CanvasBlock, type TemplateDesign } from '../templates';

// The designer's workspace for a page-layout template: the A4 page at the
// chosen zoom, every block where it prints. Drag a block to move it, drag the
// corner handle to resize; positions snap to whole millimetres unless snapping
// is off. A block whose show-if condition the preview learner doesn't meet is
// drawn faded (or hidden, when "Show hidden blocks" is off).

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

type Drag = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; origin: CanvasBlock; group: string };

export function DesignerCanvas({
  design,
  parts,
  zoom,
  showGrid,
  snap,
  showHidden,
  selectedId,
  onSelect,
  onChange,
}: {
  design: TemplateDesign;
  parts: CardParts | null;
  zoom: number;
  showGrid: boolean;
  snap: boolean;
  showHidden: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (blocks: CanvasBlock[], group?: string) => void;
}) {
  const blocks = design.blocks ?? [];
  const dragRef = useRef<Drag | null>(null);
  // Each drag is one undo step: its moves share a group name.
  const dragCount = useRef(0);
  const step = snap ? 1 : 0.5;
  const toGrid = (n: number) => Math.round(n / step) * step;

  function move(id: string, patch: Partial<CanvasBlock>, group: string) {
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
      group,
    );
  }

  function start(e: React.PointerEvent, block: CanvasBlock, mode: Drag['mode']) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(block.id);
    dragRef.current = { id: block.id, mode, startX: e.clientX, startY: e.clientY, origin: block, group: `drag-${block.id}-${++dragCount.current}` };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / (PX_PER_MM * zoom);
    const dy = (e.clientY - d.startY) / (PX_PER_MM * zoom);
    if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) return;
    const o = d.origin;
    if (d.mode === 'move') move(d.id, { x: toGrid(o.x + dx), y: toGrid(o.y + dy) }, d.group);
    else move(d.id, { w: Math.max(2, toGrid(o.w + dx)), h: Math.max(0.5, toGrid(o.h + dy)) }, d.group);
  }
  const end = () => {
    dragRef.current = null;
  };

  const width = PAGE_MM.width * PX_PER_MM * zoom;
  const height = PAGE_MM.height * PX_PER_MM * zoom;

  return (
    <div style={{ width, height }} className="relative mx-auto shrink-0">
      <div
        className="absolute left-0 top-0 bg-white shadow-[0_1px_6px_rgba(13,33,55,0.25)] origin-top-left select-none"
        style={{
          ...templateVars(design.style),
          width: `${PAGE_MM.width}mm`,
          height: `${PAGE_MM.height}mm`,
          transform: `scale(${zoom})`,
          ...(showGrid
            ? {
                backgroundImage:
                  'linear-gradient(to right, rgba(46,119,174,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(46,119,174,0.08) 1px, transparent 1px)',
                backgroundSize: '5mm 5mm',
              }
            : {}),
        }}
        onPointerDown={() => onSelect(null)}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {blocks.map((b) => {
          const visible = !parts || blockVisible(b, parts);
          if (!visible && !showHidden && b.id !== selectedId) return null;
          const selected = b.id === selectedId;
          return (
            <div
              key={b.id}
              onPointerDown={(e) => start(e, b, 'move')}
              title={
                b.showIf
                  ? `${BLOCK_INFO[b.type].label} — shows only if ${DATA_FIELD[b.showIf.field].label.toLowerCase()} ${OP_LABEL[b.showIf.op]} ${b.showIf.value}`
                  : BLOCK_INFO[b.type].label
              }
              className={`absolute cursor-move ${selected ? 'z-20' : 'hover:outline hover:outline-1 hover:outline-primary-400'} ${
                showGrid && !selected ? 'outline outline-1 outline-dashed outline-primary-200' : ''
              }`}
              style={{
                left: `${b.x}mm`,
                top: `${b.y}mm`,
                width: `${b.w}mm`,
                height: `${b.h}mm`,
                opacity: visible ? 1 : 0.35,
                ...(selected ? { outline: `${1.5 / zoom}px solid #2E77AE` } : {}),
              }}
            >
              <div className="pointer-events-none w-full h-full overflow-hidden">
                {parts ? <CanvasBlockContent block={b} parts={parts} /> : <span className="text-[10px] text-text-faint">{BLOCK_INFO[b.type].label}</span>}
              </div>
              {b.showIf && (
                <span
                  className="absolute -top-2 -right-2 rounded-full bg-accent-light text-accent-dark p-0.5 pointer-events-none"
                  style={{ transform: `scale(${1 / zoom})` }}
                >
                  <EyeOff className="w-3 h-3" aria-hidden />
                </span>
              )}
              {selected && (
                <>
                  {[
                    ['-left-1 -top-1', 'nwse-resize'],
                    ['-right-1 -top-1', 'nesw-resize'],
                    ['-left-1 -bottom-1', 'nesw-resize'],
                  ].map(([pos]) => (
                    <span key={pos} className={`absolute ${pos} w-2 h-2 bg-white border border-primary-700 pointer-events-none`} style={{ transform: `scale(${1 / zoom})` }} />
                  ))}
                  <span
                    onPointerDown={(e) => start(e, b, 'resize')}
                    className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-primary-700 border border-white cursor-nwse-resize"
                    style={{ transform: `scale(${1 / zoom})` }}
                    aria-label="Resize"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
