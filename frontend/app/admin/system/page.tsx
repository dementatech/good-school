import { redirect } from 'next/navigation';

// "System overview" was merged into the one admin dashboard. Kept so old
// bookmarks and installed-app start pages still land somewhere.
export default function SystemOverviewRedirect() {
  redirect('/admin');
}
