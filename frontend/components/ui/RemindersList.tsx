'use client';

import { Bell } from 'lucide-react';
import { Card } from './Card';

export interface ReminderItem {
  id: string;
  label: string;
  date: string;
}

export function RemindersList({ items, className = '' }: { items: ReminderItem[]; className?: string }) {
  return (
    <Card className={className}>
      <h2 className="text-sm font-semibold text-primary-900 mb-3">Reminders</h2>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-bg-muted shrink-0 mt-0.5">
                <Bell className="w-3.5 h-3.5 text-primary-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary-900 truncate">{r.label}</p>
                <p className="text-xs text-text-muted">{r.date}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
