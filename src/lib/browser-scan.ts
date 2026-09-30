import { chromium, type Browser } from "playwright";
import { existsSync } from "node:fs";
import { fetchPublicResource, normalizeUrl } from "@/lib/scanner";
import { shouldRunBrowserScan } from "@/lib/browser-scan-config";

const MAX_BROWSER_REQUESTS = 50;
const MAX_CONCURRENT_RESOURCE_FETCHES = 4;
const MAX_RESOURCE_BYTES = 400_000;
const MAX_TOTAL_RESOURCE_BYTES = 4_000_000;
const MAX_HTML_CHARS = 1_500_000;
const NAVIGATION_TIMEOUT_MS = 20_000;
const browserSlots = 2;
let activeBrowsers = 0;

export type ObservedCookie = {
  name: string;
  domain: string;
  type: "likely essential" | "possible analytics" | "possible advertising" | "unknown";
  source: "browser context during scan";
  path: string;
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string | null;
};
export type ObservedStorage = { origin: string; localStorageKeys: string[]; sessionStorageKeys: string[] };
export type ObservedRequest = { hostname: string; type: string; categories: string[]; sampleUrl: string };
export type TechnicalObservation = {
  status: "observed" | "unavailable";
  capturedAt: string;
  cookies: ObservedCookie[];
  storage: ObservedStorage[];
  thirdPartyRequests: ObservedRequest[];
  requestCount: number;
  note: string | null;
};
export type BrowserScanResult = { html: string | null; finalUrl: string | null; observation: TechnicalObservation };

export function classifyObservedDomain(hostname: string): string[] {
  const host = hostname.toLowerCase();
  const categories: string[] = [];
  if (/google-analytics|googletagmanager|analytics|segment\.io|amplitude|mixpanel|hotjar|clarity\.ms|matomo|newrelic|datadog/.test(host)) categories.push("analytics");
  if (/doubleclick|googlesyndication|adservice|adnxs|adsystem|advert|criteo|taboola|outbrain|facebook\.net|tiktok/.test(host)) categories.push("advertising or social measurement");
  if (/pixel|tracking|beacon/.test(host)) categories.push("tracking indicator in hostname");
  return categories;
}

function emptyObservation(note: string): TechnicalObservation {
  return { status: "unavailable", capturedAt: new Date().toISOString(), cookies: [], storage: [], thirdPartyRequests: [], requestCount: 0, note };
}

function cookieDomainMatches(hostname: string, cookieDomain: string): boolean {
  const domain = cookieDomain.replace(/^\./, "").toLowerCase();
  return hostname === domain || hostname.endsWith(`.${domain}`) || domain.endsWith(`.${hostname}`);
}

function isFirstParty(hostname: string, homepageHostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const home = homepageHostname.toLowerCase().replace(/^www\./, "");
  return host === home || host.endsWith(`.${home}`) || home.endsWith(`.${host}`);
}

function headerSubset(headers: Record<string, string>): Record<string, string> {
  const allowed = ["content-type", "cache-control", "last-modified", "etag", "expires", "set-cookie"];
  return Object.fromEntries(Object.entries(headers).filter(([key]) => allowed.includes(key.toLowerCase())));
}

export function classifyObservedCookie(name: string): ObservedCookie["type"] {
  const normalized = name.toLowerCase();
  if (/^(session(id)?|sid|csrf|xsrf|auth|__host-session|__secure-session)/.test(normalized)) return "likely essential";
  if (/(_ga|_gid|_gat|amp_|ajs_|mp_|hj|_clck|_clsk|matomo)/.test(normalized)) return "possible analytics";
  if (/(^|[_-])(fbp|fbc|gclid|doubleclick|ad|ads|advert|ttclid|pixel)([_-]|$)/.test(normalized)) return "possible advertising";
  return "unknown";
}

async function launchBrowser(): Promise<Browser> {
  const options = { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] };
  try {
    return await chromium.launch(options);
  } catch (bundledError) {
    const installedBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ?? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
        .find((path) => existsSync(path));
    if (!installedBrowser) throw bundledError;
    return chromium.launch({ ...options, executablePath: installedBrowser });
  }
}

export async function inspectRenderedWebsite(input: unknown): Promise<BrowserScanResult> {
  const initialUrl = normalizeUrl(input);
  if (!shouldRunBrowserScan()) {
    return {
      html: null,
      finalUrl: null,
      observation: emptyObservation("Browser observation is disabled on Vercel. Static policy discovery and analysis are still available."),
    };
  }
  if (activeBrowsers >= browserSlots) {
    return { html: null, finalUrl: null, observation: emptyObservation("Browser observation capacity is busy; the static scan results are still available.") };
  }
  activeBrowsers += 1;

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ ignoreHTTPSErrors: false, serviceWorkers: "block" });
    const page = await context.newPage();
    let intercepted = 0;
    let activeResourceFetches = 0;
    let transferredBytes = 0;
    let requestCount = 0;
    let tooManyRequests = false;
    const thirdParty = new Map<string, ObservedRequest>();

    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      const method = request.method();
      if (method !== "GET" || !/^https?:\/\//i.test(requestUrl)) {
        await route.abort();
        return;
      }
      intercepted += 1;
      if (intercepted > MAX_BROWSER_REQUESTS) {
        tooManyRequests = true;
        await route.abort();
        return;
      }
      if (activeResourceFetches >= MAX_CONCURRENT_RESOURCE_FETCHES) {
        await route.abort();
        return;
      }
      activeResourceFetches += 1;
      try {
        const result = await fetchPublicResource(requestUrl, MAX_RESOURCE_BYTES);
        transferredBytes += result.body.byteLength;
        if (transferredBytes > MAX_TOTAL_RESOURCE_BYTES) {
          tooManyRequests = true;
          await route.abort();
          return;
        }
        await route.fulfill({
          status: result.statusCode,
          headers: headerSubset(result.headers as Record<string, string>),
          body: result.body,
        });
      } catch {
        await route.abort();
      } finally {
        activeResourceFetches -= 1;
      }
    });

    page.on("request", (request) => {
      requestCount += 1;
      try {
        const parsed = new URL(request.url());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
        if (!isFirstParty(parsed.hostname, initialUrl.hostname)) {
          const key = parsed.hostname.toLowerCase();
          if (!thirdParty.has(key)) {
            thirdParty.set(key, {
              hostname: parsed.hostname,
              type: request.resourceType(),
              categories: classifyObservedDomain(parsed.hostname),
              sampleUrl: `${parsed.origin}${parsed.pathname}`.slice(0, 300),
            });
          }
        }
      } catch { /* Ignore malformed browser request URLs. */ }
    });

    let navigationError: string | null = null;
    try {
      await page.goto(initialUrl.toString(), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => undefined);
    } catch (error) {
      navigationError = error instanceof Error ? error.message.slice(0, 180) : "The browser could not render the page.";
    }

    let html: string | null = null;
    let finalUrl: string | null = null;
    let storage: ObservedStorage[] = [];
    if (!page.isClosed()) {
      try {
        const pageHtml = await page.content();
        if (pageHtml.length <= MAX_HTML_CHARS) html = pageHtml;
        finalUrl = page.url();
      } catch { /* Keep a useful unavailable observation instead of failing the scan. */ }
      storage = await page.evaluate(() => {
        const collected: ObservedStorage[] = [];
        try {
          collected.push({
            origin: location.origin,
            localStorageKeys: Array.from({ length: localStorage.length }, (_unused, index) => localStorage.key(index) ?? "").filter(Boolean).slice(0, 100),
            sessionStorageKeys: Array.from({ length: sessionStorage.length }, (_unused, index) => sessionStorage.key(index) ?? "").filter(Boolean).slice(0, 100),
          });
        } catch { /* Storage can be unavailable in opaque or restricted contexts. */ }
        return collected;
      }).catch(() => []);
    }

    const browserCookies = await context.cookies().catch(() => []);
    const hostname = (() => { try { return new URL(finalUrl ?? initialUrl.toString()).hostname; } catch { return initialUrl.hostname; } })();
    const cookies = browserCookies.slice(0, 200).map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      type: classifyObservedCookie(cookie.name),
      source: "browser context during scan" as const,
      path: cookie.path,
      expires: cookie.expires > 0 ? cookie.expires : null,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite || null,
    }));
    const filteredThirdParty = [...thirdParty.values()].filter((request) => !isFirstParty(request.hostname, hostname)).slice(0, 100);
    const noteParts = [navigationError, tooManyRequests ? `Only the first ${MAX_BROWSER_REQUESTS} browser requests were allowed.` : null].filter(Boolean);
    const observation: TechnicalObservation = {
      status: html || cookies.length || requestCount ? "observed" : "unavailable",
      capturedAt: new Date().toISOString(),
      cookies,
      storage,
      thirdPartyRequests: filteredThirdParty,
      requestCount,
      note: noteParts.length ? noteParts.join(" ") : null,
    };
    await context.close();
    return { html, finalUrl, observation };
  } catch (error) {
    return {
      html: null,
      finalUrl: null,
      observation: emptyObservation(error instanceof Error ? `Browser fallback unavailable: ${error.message.slice(0, 160)}` : "Browser fallback unavailable."),
    };
  } finally {
    await browser?.close().catch(() => undefined);
    activeBrowsers -= 1;
  }
}

export function cookieDomainIsRelated(hostname: string, domain: string): boolean {
  return cookieDomainMatches(hostname, domain);
}
