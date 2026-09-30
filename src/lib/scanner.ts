import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import ipaddr from "ipaddr.js";

const MAX_BYTES = 1_500_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".test", ".invalid"];

export class ScanError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); this.name = "ScanError"; }
}

export function normalizeUrl(input: unknown): URL {
  if (input instanceof URL) {
    if (input.href.length > 2048) throw new ScanError("Enter a valid website address.");
    const url = new URL(input.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new ScanError("Only public HTTP and HTTPS websites can be checked.");
    if (url.username || url.password) throw new ScanError("Website addresses cannot contain login credentials.");
    url.hash = "";
    return url;
  }
  if (typeof input !== "string" || input.length > 2048) throw new ScanError("Enter a valid website address.");
  const candidate = input.trim();
  if (!candidate || /[\u0000-\u0020\\]/.test(candidate)) throw new ScanError("Enter a valid website address.");
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`); }
  catch { throw new ScanError("Enter a valid website address."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ScanError("Only public HTTP and HTTPS websites can be checked.");
  if (url.username || url.password) throw new ScanError("Website addresses cannot contain login credentials.");
  url.hash = "";
  return url;
}

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === "unicast";
}

async function resolvePublicAddresses(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
  if (!host || host === "localhost" || !host.includes(".") || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new ScanError("That address is not a public website.");
  }
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw new ScanError("That address is not a public website.");
    return [{ address: host, family: ipaddr.parse(host).kind() === "ipv4" ? 4 : 6 }];
  }
  let records;
  try { records = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new ScanError("The website address could not be resolved.", 422); }
  if (!records.length || records.some(({ address }) => !isPublicAddress(address))) {
    throw new ScanError("That website resolves to a private or restricted network.");
  }
  return records.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

export type FetchResult = { statusCode: number; headers: IncomingHttpHeaders; body: Buffer; finalUrl: URL };

function requestBounded(url: URL, addresses: Array<{ address: string; family: 4 | 6 }>, maxBytes: number): Promise<{ statusCode: number; headers: IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const selected = addresses[0];
    const request = transport(url, {
      method: "GET",
      headers: { "User-Agent": "Dguard-Research/0.1", Accept: "text/html,application/xhtml+xml;q=0.9", "Accept-Encoding": "identity" },
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options !== null && "all" in options && options.all) {
          callback(null, addresses);
          return;
        }
        callback(null, selected.address, selected.family);
      },
      servername: url.hostname,
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBytes) { request.destroy(new ScanError("The response is larger than the scan limit.", 413)); return; }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new ScanError("The website took too long to respond.", 504)));
    const deadline = setTimeout(() => request.destroy(new ScanError("The website took too long to respond.", 504)), REQUEST_TIMEOUT_MS);
    request.on("close", () => clearTimeout(deadline));
    request.on("error", reject);
    request.end();
  });
}

export async function fetchPublicResource(input: unknown, maxBytes = MAX_BYTES): Promise<FetchResult> {
  let url = normalizeUrl(input);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const addresses = await resolvePublicAddresses(url.hostname);
    const result = await requestBounded(url, addresses, maxBytes);
    const location = result.headers.location;
    if ([301, 302, 303, 307, 308].includes(result.statusCode) && location) {
      if (redirectCount === MAX_REDIRECTS) throw new ScanError("The website redirected too many times.", 422);
      try { url = normalizeUrl(new URL(location, url).toString()); }
      catch (error) { if (error instanceof ScanError) throw error; throw new ScanError("The website returned an invalid redirect.", 422); }
      continue;
    }
    if (result.statusCode < 200 || result.statusCode >= 300) throw new ScanError(`The website responded with HTTP ${result.statusCode}.`, 422);
    return { ...result, finalUrl: url };
  }
  throw new ScanError("The website could not be reached.", 422);
}

export async function fetchPublicHomepage(input: unknown): Promise<FetchResult> {
  const result = await fetchPublicResource(input);
  const contentType = String(result.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new ScanError("The address did not return an HTML webpage.", 415);
  return result;
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (!match) return null;
  const title = match[1].replace(/<[^>]*>/g, "").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();
  return title.slice(0, 200) || null;
}