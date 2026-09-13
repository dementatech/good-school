// @vitest-environment jsdom

/**
 * iOS never fires `beforeinstallprompt`, so the instructional banner is the
 * only install path there — and it silently does nothing useful for visitors
 * stuck in an in-app webview (Instagram, TikTok, ...), whose share sheet has
 * no "Add to Home Screen" entry. These tests pin the UA-branching logic that
 * decides which message to show, since nothing else exercises it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { InstallPrompt } from "./InstallPrompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0.0";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

function stubNavigator(userAgent: string) {
  vi.stubGlobal("navigator", { ...window.navigator, userAgent, platform: "", maxTouchPoints: 0 });
}

function stubStandalone(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
}

beforeEach(() => {
  localStorage.clear();
  stubStandalone(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InstallPrompt on iOS", () => {
  it("points regular Safari visitors at the Share button", () => {
    stubNavigator(IPHONE_SAFARI);
    const { container } = render(<InstallPrompt />);

    expect(container.textContent).toMatch(/Add to Home Screen/);
    expect(container.textContent).not.toMatch(/Open this page in Safari/);
  });

  it("tells in-app-browser visitors to open Safari first", () => {
    stubNavigator(IPHONE_INSTAGRAM);
    const { container } = render(<InstallPrompt />);

    expect(container.textContent).toMatch(/Open this page in Safari/);
  });

  it("stays hidden once already running standalone", () => {
    stubStandalone(true);
    stubNavigator(IPHONE_SAFARI);
    const { container } = render(<InstallPrompt />);

    expect(container.firstChild).toBeNull();
  });

  it("stays hidden after a recent dismissal", () => {
    localStorage.setItem("gs-install-prompt-dismissed", String(Date.now()));
    stubNavigator(IPHONE_SAFARI);
    const { container } = render(<InstallPrompt />);

    expect(container.firstChild).toBeNull();
  });
});

describe("InstallPrompt off iOS", () => {
  it("renders nothing until beforeinstallprompt fires", () => {
    stubNavigator(ANDROID_CHROME);
    const { container } = render(<InstallPrompt />);

    expect(container.firstChild).toBeNull();
  });
});
