'use client';

import { useEffect, useId, useState } from "react";

/** The brand blue — keep in step with `--color-primary-700` in globals.css. */
export const LOADER_COLOR = "#1e3a8a";

const LOGO_PATH =
  "M56.12,21,53,25.07a1.06,1.06,0,0,1-1.64,0,29.39,29.39,0,0,0-5.62-5.52,29.32,29.32,0,0,0-34.16-.65,1.05,1.05,0,0,0-.23,1.51l.13.15a1,1,0,0,0,1.41.23,26.94,26.94,0,0,1,31.46.57,26.62,26.62,0,0,1,5.87,6,1,1,0,0,1,0,1.23l-3.91,5-1.49,1.91L40.51,40.9a1,1,0,0,1-1.83-.39A11.09,11.09,0,0,0,34.32,34a10.89,10.89,0,0,0-6.27-2A10.72,10.72,0,0,0,23,33.3a1,1,0,0,0-.35,1.56l.27.37a1.07,1.07,0,0,0,1.32.27,8.5,8.5,0,0,1,3.81-1h.13A8.43,8.43,0,0,1,36.62,43a8.23,8.23,0,0,1-1.51,4.81v0l-.57.72s0,0,0,0,0,0-.05,0a8.4,8.4,0,0,1-6.29,2.82h-.13a8.49,8.49,0,0,1-6.39-3.07l-.05,0-.2-.25,0,0-4-5.06-.29-.39-5.06-6.47A1,1,0,0,1,12,35a18.58,18.58,0,0,1,5.52-6.74,17.92,17.92,0,0,1,20.64-.62,1,1,0,0,0,1.39-.22,1.06,1.06,0,0,0,.22-.64,1.13,1.13,0,0,0-.47-.9,20.39,20.39,0,0,0-23.12.67,20.73,20.73,0,0,0-5.27,5.73,1,1,0,0,1-1.71.09L5.7,28,4.24,26.16.23,21a1,1,0,0,1,0-1.31,35.84,35.84,0,0,1,4.64-4.66A14.37,14.37,0,0,1,5.28.82,14.45,14.45,0,0,1,17.92,8.1a36.76,36.76,0,0,1,20.34,0,3.86,3.86,0,0,1,.3-.57A14.21,14.21,0,0,1,50.74,0a14.24,14.24,0,0,1,.4,14.32l-.2.32A36.31,36.31,0,0,1,56.1,19.7,1,1,0,0,1,56.12,21Z";

// ─── The official system loader ─────────────────────────────────────────────

interface DrawInLoaderProps {
  /** Any valid CSS color — hex, rgb, var(--token), etc. Defaults to the brand blue. */
  color?: string;
  /** Pixel size of the square the loader renders in. Defaults to 48. */
  size?: number;
  /** Full loop duration in seconds. Defaults to 2.6. */
  duration?: number;
  /** Stroke width during the draw phase, in SVG units. Defaults to 1.4. */
  strokeWidth?: number;
  className?: string;
  /** Accessible label for screen readers. Defaults to "Loading". */
  label?: string;
  /**
   * Ordered reassurance messages shown under the mark. The loader starts on
   * the first message and steps forward one at a time the longer loading
   * takes — it does NOT loop back to the start, so a stalled load reads as
   * "still working" rather than resetting and looking stuck.
   * Pass `false` to render no message at all.
   */
  messages?: string[] | false;
  /** How long each message stays up before advancing, in ms. Defaults to 4000. */
  messageIntervalMs?: number;
  /** Text color for the status message. Defaults to a muted gray. */
  textColor?: string;
}

const DEFAULT_MESSAGES = ["Loading resources", "Just a minute", "Almost there"];

/**
 * Draw-in outline loader with an optional progressive status line.
 *
 * The mark traces itself as an outline, fills solid, then resets and loops.
 * Below it (when `messages` is set), a single reassurance line steps forward
 * through the list the longer the load takes.
 *
 * Prefer the `Loader` / `PageLoader` wrappers below over calling this directly.
 */
export default function DrawInLoader({
  color = LOADER_COLOR,
  size = 48,
  duration = 2.6,
  strokeWidth = 1.4,
  className,
  label = "Loading",
  messages = DEFAULT_MESSAGES,
  messageIntervalMs = 4000,
  textColor = "#7c8896",
}: DrawInLoaderProps) {
  const uid = useId().replace(/:/g, "");
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!messages || messages.length <= 1) return;
    if (messageIndex >= messages.length - 1) return;

    const timer = setTimeout(() => {
      setMessageIndex((i) => Math.min(i + 1, messages.length - 1));
    }, messageIntervalMs);

    return () => clearTimeout(timer);
  }, [messageIndex, messages, messageIntervalMs]);

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={messages ? messages[messageIndex] : label}
      className={className}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12 }}
    >
      <style>{`
        @keyframes drawInStroke-${uid} {
          0%   { stroke-dashoffset: 1; opacity: 1; }
          55%  { stroke-dashoffset: 0; opacity: 1; }
          75%  { stroke-dashoffset: 0; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes drawInFill-${uid} {
          0%, 55% { opacity: 0; }
          75%     { opacity: 1; }
          92%     { opacity: 1; }
          100%    { opacity: 0; }
        }
        .drawInStroke-${uid} {
          fill: none;
          stroke: ${color};
          stroke-width: ${strokeWidth};
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: drawInStroke-${uid} ${duration}s cubic-bezier(.65,0,.35,1) infinite;
        }
        .drawInFill-${uid} {
          fill: ${color};
          opacity: 0;
          animation: drawInFill-${uid} ${duration}s cubic-bezier(.65,0,.35,1) infinite;
        }
        .drawInMsg-${uid} {
          font-family: inherit;
          font-size: 13px;
          color: ${textColor};
          transition: opacity 0.35s ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .drawInStroke-${uid}, .drawInFill-${uid} { animation: none; }
          .drawInStroke-${uid} { opacity: 0; }
          .drawInFill-${uid} { opacity: 1; }
        }
      `}</style>

      <svg width={size} height={size * (51.43 / 56.34)} viewBox="0 0 56.34 51.43" xmlns="http://www.w3.org/2000/svg">
        <path className={`drawInFill-${uid}`} d={LOGO_PATH} />
        <path className={`drawInStroke-${uid}`} pathLength={1} d={LOGO_PATH} />
      </svg>

      {messages && (
        <span className={`drawInMsg-${uid}`} key={messageIndex}>
          {messages[messageIndex]}
        </span>
      )}
    </span>
  );
}

interface LoaderProps {
  size?: number;
  className?: string;
  label?: string;
  /** Ordered captions for a long wait; steps forward the longer it takes. */
  messages?: string[] | false;
}

/**
 * The system loader — the draw-in brand mark, no caption by default. For a
 * panel, a table cell, a card that is still fetching. For a whole route/auth
 * gate use `PageLoader`.
 */
export function Loader({ size = 44, className, label, messages = false }: LoaderProps) {
  return <DrawInLoader size={size} className={className} label={label} messages={messages} />;
}

/**
 * The system loader centred in the full viewport on the app background — for
 * route transitions, the auth gate, and Suspense fallbacks that render before
 * any layout chrome exists.
 */
export function PageLoader({ size = 72, label, messages = false }: LoaderProps) {
  return (
    <div className="min-h-screen w-full bg-bg flex items-center justify-center">
      <DrawInLoader size={size} label={label} messages={messages} />
    </div>
  );
}

// ─── Shimmer variant — used only on the "coming soon" card ───────────────────

interface ShimmerLoaderProps {
  /** Any valid CSS color — the shimmer highlight and the dim base are derived from it. */
  color?: string;
  /** Pixel size of the square the loader renders in. Defaults to 48. */
  size?: number;
  /** Full sweep duration in seconds (there and back). Defaults to 1.8. */
  duration?: number;
  /** Opacity of the static silhouette under the sweep. Defaults to 0.16. */
  baseOpacity?: number;
  className?: string;
  /** Accessible label for screen readers. Defaults to "Loading". */
  label?: string;
}

/**
 * Shimmer sweep loader. A dim silhouette of the mark sits still while a light
 * band travels across it, clipped to the mark's own shape. Deliberately NOT
 * the system loader — reserved for the `ComingSoon` card.
 */
export function ShimmerLoader({
  color = LOADER_COLOR,
  size = 48,
  duration = 1.8,
  baseOpacity = 0.16,
  className,
  label = "Loading",
}: ShimmerLoaderProps) {
  const uid = useId().replace(/:/g, "");
  const clipId = `shimmerClip-${uid}`;
  const gradId = `shimmerGrad-${uid}`;

  return (
    <span
      role="status"
      aria-label={label}
      className={className}
      style={{ display: "inline-block", width: size, height: size * (51.43 / 56.34), lineHeight: 0 }}
    >
      <style>{`
        @keyframes shimmerSweep-${uid} {
          0%   { transform: translateX(-70px); }
          100% { transform: translateX(70px); }
        }
        .shimmerBand-${uid} {
          animation: shimmerSweep-${uid} ${duration}s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .shimmerBand-${uid} { animation: none; opacity: 0.5; }
        }
      `}</style>
      <svg width={size} height={size * (51.43 / 56.34)} viewBox="0 0 56.34 51.43" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id={clipId}>
            <path d={LOGO_PATH} />
          </clipPath>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={LOGO_PATH} fill={color} opacity={baseOpacity} />

        <g clipPath={`url(#${clipId})`}>
          <rect className={`shimmerBand-${uid}`} x={-8} y={-10} width={34} height={72} fill={`url(#${gradId})`} />
        </g>
      </svg>
    </span>
  );
}
