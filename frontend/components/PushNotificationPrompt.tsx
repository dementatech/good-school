'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { isFeatureReady } from '@/lib/features';
import { fetchOne, submitJson } from '@/lib/api/envelope';

const DISMISS_KEY = 'gs-push-prompt-dismissed';
const DISMISS_DAYS = 14;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode etc.) — banner just reappears next visit.
  }
}

// The Fetch/Push APIs want the VAPID key as bytes, but it only travels over
// the wire as the base64url string web-push generates it as.
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Idempotent: safe to call on every load once permission is granted, not
 *  just right after the user clicks "Enable" — a subscription can outlive
 *  the banner (browser reinstall, cleared site data) without this ever
 *  running again otherwise. */
async function subscribe(): Promise<void> {
  const key = await fetchOne<{ publicKey: string }>('/api/v1/notifications/push/public-key');
  if (!key?.publicKey) return; // push isn't configured server-side (no VAPID keys) — nothing to do

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.publicKey),
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys) return;
  await submitJson('/api/v1/notifications/push/subscribe', 'POST', {
    endpoint: json.endpoint,
    keys: json.keys,
  });
}

/**
 * Asks a signed-in visitor to turn on push notifications. Mounted once,
 * inside AuthProvider, in the root layout — it renders nothing until there's
 * a signed-in user to subscribe.
 *
 * A site can never force the OS-level permission grant (Notification.
 * requestPermission() only resolves from a real user gesture, same
 * constraint as InstallPrompt.tsx's install flow) — this is the closest
 * available: a clear, dismissible ask, re-shown after 14 days if declined,
 * never shown again once the browser reports 'denied'.
 */
export function PushNotificationPrompt() {
  const { isAuthenticated } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isFeatureReady('notifications')) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      void subscribe();
      return;
    }
    if (Notification.permission === 'default' && !isDismissed()) {
      // One-shot permission-state check, not a subscribable store — same
      // pattern as InstallPrompt.tsx's iOS-device check.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot permission-state check, not a subscribable store
      setShow(true);
    }
    // 'denied': nothing to show and nothing to do — respect the refusal.
  }, [isAuthenticated]);

  async function enable() {
    setShow(false);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribe();
    } else {
      // Denied or dismissed via the browser's own prompt — don't ask again soon.
      setDismissed();
    }
  }

  function dismiss() {
    setDismissed();
    setShow(false);
  }

  if (!show) return null;

  return (
    // bottom-24 rather than bottom-4 (InstallPrompt/iOS banner's spot) — the
    // two can legitimately be visible at once (not yet installed AND not yet
    // subscribed), and this stacks above it instead of overlapping.
    <div className="print:hidden fixed inset-x-4 bottom-24 z-50 flex items-center gap-3 rounded-xl bg-primary-700 px-4 py-3 text-white shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <Bell className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="flex-1 text-sm">
        Turn on notifications to hear about results, attendance and other updates as they happen.
      </p>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => void enable()}
          className="rounded-md bg-white px-3 py-1 text-sm font-medium text-primary-700 hover:bg-white/90"
        >
          Enable
        </button>
        <button type="button" onClick={dismiss} className="px-1 text-xs text-white/80 hover:text-white">
          Not now
        </button>
      </div>
    </div>
  );
}
