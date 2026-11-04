'use client';

import { useEffect, useRef, useState } from 'react';

/** The live width of an element, so a D3 chart can draw at real pixel sizes. */
export function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
