import { CalendarX2 } from 'lucide-react';

export default function EventNotFound() {
  return (
    <main className="min-h-dvh bg-bg-canvas flex items-center justify-center p-6">
      <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-card">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary-100 text-primary-900">
          <CalendarX2 className="size-6" aria-hidden />
        </span>
        <h1 className="text-lg font-bold text-primary-900">This event isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted-foreground">The link may have been switched off. Ask whoever sent it for a new one.</p>
      </div>
    </main>
  );
}
