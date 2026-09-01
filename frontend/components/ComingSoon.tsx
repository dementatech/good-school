'use client';

import { ShimmerLoader } from '@/components/ui/loader';

/**
 * Shown wherever a feature's UI is in place but its backend has not been
 * ported from Supabase to the Fastify service yet. See `lib/features.ts`.
 */
export function ComingSoon({ featureLabel }: { featureLabel?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-bg-card border border-border rounded-2xl p-8 sm:p-10">
        <div className="mx-auto flex items-center justify-center">
          <ShimmerLoader size={56} label="Feature in development" />
        </div>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-primary-900">
          Dementa is cooking
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {featureLabel ? (
            <>
              <span className="font-medium text-text-secondary">{featureLabel}</span> is coming
              soon.
            </>
          ) : (
            'Feature is coming soon.'
          )}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent-light text-accent-dark px-3 py-1 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-dark" />
          In development
        </div>
      </div>
    </div>
  );
}
