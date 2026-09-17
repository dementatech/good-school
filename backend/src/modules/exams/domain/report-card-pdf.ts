import puppeteer, { type Browser } from "puppeteer";

// The frontend origin — the same env var email links already use
// (auth/domain/password-reset.ts). Puppeteer navigates here directly
// (bypassing the Next.js dev proxy) to render the real report-cards page.
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export class ReportCardPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportCardPdfError";
  }
}

// One headless Chrome instance shared across requests — launching fresh per
// request costs ~1-2s. --no-sandbox is standard for Chromium in a container
// (Docker blocks its sandbox namespaces by default); safe here since it only
// ever renders this app's own authenticated pages, never arbitrary content.
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    browserPromise.catch(() => {
      browserPromise = null; // let the next call retry instead of caching a broken launch
    });
  }
  return browserPromise;
}

/**
 * Renders the already-built report-cards print page (frontend) to a real
 * vector-text A4 PDF via headless Chrome — the same rendering engine (and
 * the same @page CSS) a manual browser print would use, just automated
 * server-side so the response is a direct file download. Reuses the exact
 * page a user would otherwise print by hand — same component, same
 * O-Level/A-Level split, zero duplicated template.
 *
 * `cookieHeader` is the caller's own session cookie, forwarded so the
 * headless browser loads the page authenticated as the same school_admin —
 * see report-cards/page.tsx's `data-pdf-ready` marker for how this knows
 * the (client-side, fetch-driven) page has actually finished rendering.
 */
export async function renderReportCardsPdf(path: string, cookieHeader: string | undefined): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    }
    const response = await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle0", timeout: 45_000 });
    if (!response || !response.ok()) {
      throw new ReportCardPdfError(`Could not load the report page (status ${response?.status() ?? "unknown"}).`);
    }
    await page.waitForSelector('body[data-pdf-ready="true"]', { timeout: 90_000 });
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
