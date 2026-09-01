import { PortalGate } from '@/components/auth/PortalGate';
import { FeatureGate } from '@/components/FeatureGate';
import type { Role } from '@/lib/auth/session';

const SUPER_ADMIN_ROLES: Role[] = ['super_admin'];

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={SUPER_ADMIN_ROLES}>
      <FeatureGate>{children}</FeatureGate>
    </PortalGate>
  );
}
