# Dguard

Dguard is a privacy intelligence service that reads public website policies and presents source-linked disclosures. It safely fetches homepages, discovers likely privacy and cookie policy links, extracts structured clauses, and generates a deterministic evidence-backed report. Where browser support is provisioned, it can also render pages and separately observe cookies, browser storage keys, and third-party request domains.

## Requirements

- Node.js 20.9 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, enter a public website address, and select **Analyze**.

## Validate

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

No API keys or environment variables are required. The scanner rejects non-HTTP(S) URLs, credentials, private/reserved IP ranges, restricted local hostnames, and DNS names that resolve to any non-public address. Redirects are manually followed and checked again. Each fetched page has a five-redirect limit, an 8-second timeout, a 1.5 MB response limit, and HTML content-type validation. Playwright network requests are routed through the same validated transport, capped at 50 requests and 4 MB total browser resources. The API also applies per-process rate and concurrency limits. Policy-link confidence is heuristic; the extractor preserves headings, numbered sections, paragraphs, lists, tables, source URLs, and bounded chunks.

Policy findings use a built-in terminology/regex ontology and retain sentence evidence, section, source URL, and a heuristic confidence. Important clauses are ranked with TF-IDF and TextRank; known entity names use a small predefined dictionary. The 0–100 transparency profile is an equal-weight aggregate of seven disclosed-text dimensions, **not a trust, safety, or compliance score**. “Not found in text” is not a claim that a practice does not happen. Browser observations are labeled separately from policy statements; cookie type labels are name-based heuristics.

## Deployment notes

Analysis is deterministic and does not use generative AI. On Vercel, browser observation is disabled by default so policy discovery and analysis work without a serverless browser binary. To enable it after provisioning a compatible Chromium binary, set `DGUARD_ENABLE_BROWSER_SCAN=1`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if it is not at Playwright's default path. Local Windows can fall back to Chrome or Edge. Per-process rate limiting is suitable for a single instance; multi-instance deployments should use shared rate limiting and trusted proxy-derived client identity.
