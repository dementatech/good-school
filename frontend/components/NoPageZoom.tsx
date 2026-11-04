'use client';

import { useEffect } from 'react';

/**
 * iOS Safari ignores `user-scalable=no` in the viewport, so a pinch still zooms
 * the page unless the gesture itself is cancelled. The library's PDF reader
 * (`.yarl__root`) has its own pinch zoom, so it keeps the gesture.
 */
export function NoPageZoom() {
  useEffect(() => {
    const allowed = (event: Event) => event.target instanceof Element && event.target.closest('.yarl__root') !== null;
    const cancelGesture = (event: Event) => {
      if (!allowed(event)) event.preventDefault();
    };
    const cancelPinch = (event: TouchEvent) => {
      if (event.touches.length > 1 && !allowed(event)) event.preventDefault();
    };
    document.addEventListener('gesturestart', cancelGesture, { passive: false });
    document.addEventListener('touchmove', cancelPinch, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', cancelGesture);
      document.removeEventListener('touchmove', cancelPinch);
    };
  }, []);

  return null;
}
