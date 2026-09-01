'use client';

import { usePathname } from 'next/navigation';
import { ComingSoon } from '@/components/ComingSoon';
import { featureForPath, isFeatureReady, type FeatureKey } from '@/lib/features';

/**
 * Renders children only when the feature that owns the current route (or the
 * explicitly named `feature`) has a live backend. Otherwise shows the
 * "Dementa is cooking" screen.
 *
 * Mounted once inside each portal layout, wrapping `{children}`, so the portal
 * shell (sidebar, header) stays usable while individual features are still
 * being wired up.
 */
export function FeatureGate({
  feature,
  children,
}: {
  feature?: FeatureKey;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (feature) {
    return isFeatureReady(feature) ? <>{children}</> : <ComingSoon featureLabel={undefined} />;
  }

  const match = featureForPath(pathname);
  if (!match) return <>{children}</>;
  if (match.meta.ready) return <>{children}</>;
  return <ComingSoon featureLabel={match.meta.label} />;
}
