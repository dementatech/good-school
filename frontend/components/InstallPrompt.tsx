"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "gs-install-prompt-dismissed";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode etc.) — nothing to persist, banner just reappears next visit.
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice() {
  const ua = navigator.userAgent;
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "MacIntel" but, unlike a real Mac, supports touch.
  const isIPadOS13 = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOSUA || isIPadOS13;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    if (isIOSDevice()) {
      // One-shot client feature-detection hydrate, same pattern as accounts/page.tsx.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot UA/standalone check, not a subscribable store
      setShowIOSBanner(true);
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed();
    setDeferredPrompt(null);
    setShowIOSBanner(false);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (deferredPrompt) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-xl bg-primary-700 px-4 py-3 text-white shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm">
        <p className="text-sm">Install Good School for quicker, full-screen access.</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-1 text-sm text-white/80 hover:text-white"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleInstallClick}
            className="rounded-md bg-white px-3 py-1 text-sm font-medium text-primary-700 hover:bg-white/90"
          >
            Install
          </button>
        </div>
      </div>
    );
  }

  if (showIOSBanner) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-xl bg-primary-700 px-4 py-3 text-white shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm">
        <p className="text-sm">
          Install Good School: tap <span aria-hidden="true">Share</span>, then &ldquo;Add to Home
          Screen&rdquo;.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md px-2 py-1 text-sm text-white/80 hover:text-white"
        >
          Got it
        </button>
      </div>
    );
  }

  return null;
}
