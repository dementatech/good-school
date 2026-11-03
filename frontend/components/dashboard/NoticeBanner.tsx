import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/kit/button';
import { Card } from '@/components/kit/card';

/** The single thing most worth attention today. Omit it when there's nothing to say. */
export function NoticeBanner({
  title,
  message,
  href,
  actionLabel,
}: {
  title: string;
  message: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <Card className="flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:px-5 mb-3 sm:mb-4">
      <span className="hidden sm:flex size-11 rounded-full bg-primary-900 text-white items-center justify-center shrink-0">
        <BellRing className="size-5" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary-900">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
      </div>
      {href && actionLabel && (
        <Button asChild size="sm" className="self-start sm:self-auto shrink-0 rounded-full">
          <Link href={href}>{actionLabel}</Link>
        </Button>
      )}
    </Card>
  );
}
