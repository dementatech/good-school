import { PortalGate } from '@/components/auth/PortalGate';
import type { Role } from '@/lib/auth/session';

const STUDENT_ROLES: Role[] = ['student'];

export default function ProtectedAssessmentLayout({ children }: { children: React.ReactNode }) {
  // Feature-gating happens inside the (dashboard) group so the student keeps
  // their portal shell; the bare take/paper/practice routes are only reachable
  // from that (gated) dashboard during Phase 1.
  return <PortalGate roles={STUDENT_ROLES}>{children}</PortalGate>;
}
