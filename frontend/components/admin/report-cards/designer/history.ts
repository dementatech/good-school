import { useCallback, useState } from 'react';

// Undo / redo for the designer. Every change is a step, except that changes
// sharing a `group` (one drag, or typing into one box) within a second of
// each other merge into a single step — so Ctrl+Z undoes the whole drag, not
// one pixel of it.

const LIMIT = 100;
const MERGE_MS = 1000;

interface State<T> {
  past: T[];
  present: T;
  future: T[];
  group: string | null;
  at: number;
}

export function useHistory<T>(initial: T) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [], group: null, at: 0 });

  const set = useCallback((next: T | ((current: T) => T), group?: string) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (current: T) => T)(s.present) : next;
      if (value === s.present) return s;
      const now = Date.now();
      const merge = !!group && group === s.group && now - s.at < MERGE_MS;
      return {
        past: merge ? s.past : [...s.past, s.present].slice(-LIMIT),
        present: value,
        future: [],
        group: group ?? null,
        at: now,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) =>
      s.past.length === 0
        ? s
        : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], group: null, at: 0 },
    );
  }, []);

  const redo = useCallback(() => {
    setState((s) =>
      s.future.length === 0 ? s : { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), group: null, at: 0 },
    );
  }, []);

  /** Starts over from `value` with no history (after loading or saving). */
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [], group: null, at: 0 }), []);

  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
