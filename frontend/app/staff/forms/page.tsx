import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import { ClipboardCheck, FileText, Laptop, Smile } from 'lucide-react';

// Listed in the order a teacher actually works: register at the start of the
// lesson, report and practical skills after it. Practical scoring reads its
// roster from the attendance session, so it deliberately sits last — it has
// nothing to show until the register exists. Behaviour Rating has no such
// dependency (it's a class/stream pick, not a session), so it sits with the
// other standalone forms rather than after practical.
const FORMS = [
  { href: '/staff/attendance', label: 'Attendance', description: 'Mark the roster at the start of a lesson.', icon: ClipboardCheck },
  { href: '/staff/lessons',    label: 'Lesson Reports', description: 'File what happened after the lesson.', icon: FileText },
  { href: '/staff/practical',  label: 'Practical Skills', description: 'Score lab skills for the learners you had.', icon: Laptop },
  { href: '/staff/behaviour',  label: 'Behaviour Rating', description: 'Rate how a class has been behaving this term.', icon: Smile },
];

export default function StaffFormsPage() {
  return (
    <DashboardShell>
      <WelcomeBanner subtitle="Field forms you fill as a teacher." />

      <DashboardGrid>
        {FORMS.map((f, i) => (
          <StatCard
            key={f.href}
            icon={f.icon}
            label={f.label}
            description={f.description}
            href={f.href}
            accent={i === 0 ? 'hero' : 'neutral'}
          />
        ))}
      </DashboardGrid>
    </DashboardShell>
  );
}
