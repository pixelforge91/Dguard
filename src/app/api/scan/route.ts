import { NextRequest, NextResponse } from "next/server";
import { analyzePolicies } from "@/lib/analysis";
import { shouldRunBrowserScan } from "@/lib/browser-scan-config";
import { discoverPolicies, extractPolicy, type ExtractedPolicy, type PolicyCandidate } from "@/lib/policies";
import { ScanError, extractTitle, fetchPublicHomepage } from "@/lib/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_CONCURRENT_SCANS = 4;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let activeScans = 0;
const MAX_REQUEST_BYTES = 4096;

function clientKey(request: NextRequest): string {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (rateBuckets.size > 5000) for (const [bucketKey, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

async function readPayload(request: NextRequest): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new ScanError("Send a valid website address.");

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new ScanError("The request is too large.", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new ScanError("Send a valid website address."); }
}

async function inspectPolicy(candidate: PolicyCandidate | null): Promise<{
  candidate: PolicyCandidate | null;
  policy: ExtractedPolicy | null;
  error: string | null;
}> {
  if (!candidate) return { candidate: null, policy: null, error: null };
  try {
    const page = await fetchPublicHomepage(candidate.url);
    return {
      candidate,
      policy: extractPolicy(page.body.toString("utf8"), page.finalUrl.toString()),
      error: null,
    };
  } catch (error) {
    return {
      candidate,
      policy: null,
      error: error instanceof ScanError ? error.message : "This policy page could not be fetched.",
    };
  }
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return NextResponse.json({ error: "Send a JSON request." }, { status: 415 });
  if (rateLimited(clientKey(request))) return NextResponse.json({ error: "Too many checks. Please try again in a minute." }, { status: 429 });
  if (activeScans >= MAX_CONCURRENT_SCANS) return NextResponse.json({ error: "Checks are busy right now. Please try again shortly." }, { status: 503 });
  activeScans += 1;
  try {
    const payload = await readPayload(request);
    const url = typeof payload === "object" && payload !== null && "url" in payload ? payload.url : undefined;
    const result = await fetchPublicHomepage(url);
    const homepageHtml = result.body.toString("utf8");
    const discovered = discoverPolicies(homepageHtml, result.finalUrl.toString());
    const rendered = shouldRunBrowserScan()
      ? await import("@/lib/browser-scan").then(({ inspectRenderedWebsite }) => inspectRenderedWebsite(result.finalUrl))
      : {
          html: null,
          finalUrl: null,
          observation: {
            status: "unavailable" as const,
            capturedAt: new Date().toISOString(),
            cookies: [],
            storage: [],
            thirdPartyRequests: [],
            requestCount: 0,
            note: "Browser observation is disabled in this deployment. Static policy discovery and analysis are available.",
          },
        };
    const renderedPolicies = rendered.html
      ? discoverPolicies(rendered.html, rendered.finalUrl ?? result.finalUrl.toString())
      : { privacy: null, cookie: null };
    const selectCandidate = (staticCandidate: PolicyCandidate | null, renderedCandidate: PolicyCandidate | null) => {
      if (!staticCandidate) return renderedCandidate;
      if (!renderedCandidate) return staticCandidate;
      return renderedCandidate.confidence > staticCandidate.confidence ? renderedCandidate : staticCandidate;
    };
    const privacyCandidate = selectCandidate(discovered.privacy, renderedPolicies.privacy);
    const cookieCandidate = selectCandidate(discovered.cookie, renderedPolicies.cookie);
    const [privacyPolicy, cookiePolicy] = await Promise.all([
      inspectPolicy(privacyCandidate),
      inspectPolicy(cookieCandidate),
    ]);
    const extractedPolicies = [privacyPolicy.policy, cookiePolicy.policy].filter((policy): policy is ExtractedPolicy => policy !== null);
    const analysis = analyzePolicies(extractedPolicies, extractedPolicies.length);
    if (rendered.observation.status === "unavailable") {
      rendered.observation.note = [
        "Static homepage and policy results are still available.",
        rendered.observation.note,
      ].filter(Boolean).join(" ");
    }
    return NextResponse.json({
      requestedUrl: url,
      finalUrl: result.finalUrl.toString(),
      domain: result.finalUrl.hostname,
      title: extractTitle(homepageHtml),
      statusCode: result.statusCode,
      contentType: result.headers["content-type"] ?? "text/html",
      bytesRead: result.body.byteLength,
      policies: {
        privacy: privacyPolicy,
        cookie: cookiePolicy,
      },
      analysis,
      observation: rendered.observation,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ScanError ? error.statusCode : 502;
    const message = error instanceof ScanError ? error.message : "The website could not be reached. Check the address and try again.";
    return NextResponse.json({ error: message }, { status });
  } finally { activeScans -= 1; }
}