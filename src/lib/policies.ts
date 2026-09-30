import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export type PolicyKind = "privacy" | "cookie";
export type PolicyCandidate = {
  url: string;
  confidence: number;
  matchedSignals: string[];
};
export type PolicyBlock = {
  type: "paragraph" | "list" | "table" | "quote";
  text: string;
};
export type PolicySection = {
  reference: string | null;
  heading: string | null;
  blocks: PolicyBlock[];
  text: string;
};
export type PolicyChunk = {
  index: number;
  section: string | null;
  heading: string | null;
  text: string;
};
export type ExtractedPolicy = {
  sourceUrl: string;
  title: string | null;
  text: string;
  sections: PolicySection[];
  chunks: PolicyChunk[];
  truncated: boolean;
};

const MIN_CONFIDENCE = 0.4;
const MAX_SECTIONS = 120;
const MAX_TEXT_LENGTH = 120_000;
const CHUNK_SIZE = 6_000;
const PRIVACY_TERMS = /\bprivacy\b|\bdata protection\b|\bpersonal data\b|\bpersonal information\b/i;
const COOKIE_TERMS = /\bcookies?\b|\btracking technologies\b/i;
const POLICY_TERMS = /\bpolicy\b|\bnotice\b|\bstatement\b|\bsettings\b|\bpreferences\b/i;
const EXPLICIT_PRIVACY = /privacy\s+(policy|notice|statement)|data\s+protection|your\s+privacy|privacy\s+center/i;
const EXPLICIT_COOKIES = /cookie\s+(policy|notice|settings|preferences)|cookies?\s+(policy|notice|settings|preferences)|manage\s+cookies/i;

function normalized(value: string): string {
  return value.toLowerCase().replace(/[\s\u00a0]+/g, " ").trim();
}

function typeTerm(kind: PolicyKind): RegExp {
  return kind === "privacy" ? PRIVACY_TERMS : COOKIE_TERMS;
}

function explicitTerm(kind: PolicyKind): RegExp {
  return kind === "privacy" ? EXPLICIT_PRIVACY : EXPLICIT_COOKIES;
}

function scoreLink(
  kind: PolicyKind,
  anchor: string,
  hrefPath: string,
  title: string,
  pageTitle: string,
  context: string,
  location: string,
): { confidence: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  const cleanAnchor = normalized(anchor);
  const cleanPath = normalized(hrefPath.replace(/[-_/]+/g, " "));
  const cleanTitle = normalized(title);
  const cleanPageTitle = normalized(pageTitle);
  const cleanContext = normalized(context);
  const categoryAnchor = typeTerm(kind).test(cleanAnchor);
  const categoryPath = typeTerm(kind).test(cleanPath);
  const categoryTitle = typeTerm(kind).test(cleanTitle);
  const categoryPageTitle = typeTerm(kind).test(cleanPageTitle);
  const categoryContext = typeTerm(kind).test(cleanContext);

  if (categoryAnchor) {
    const explicit = explicitTerm(kind).test(cleanAnchor);
    score += explicit ? 0.49 : 0.4;
    signals.push(explicit ? "explicit anchor label" : "category in anchor label");
  }
  if (categoryPath) {
    const explicit = explicitTerm(kind).test(cleanPath) || /^(?:privacy|cookies?)$/.test(cleanPath);
    score += explicit ? 0.4 : 0.29;
    signals.push("category in URL path");
  }
  if (categoryTitle) {
    score += 0.14;
    signals.push("category in link title");
  }
  if (categoryPageTitle && (categoryAnchor || categoryPath || categoryTitle)) {
    score += 0.06;
    signals.push("category in homepage title");
  }
  if (categoryContext) {
    score += 0.08;
    signals.push("category in surrounding text");
  }
  if ((location === "footer" || location === "nav") && (categoryAnchor || categoryPath || categoryTitle)) {
    score += 0.03;
    signals.push(`located in ${location}`);
  }
  if (POLICY_TERMS.test(`${cleanAnchor} ${cleanPath} ${cleanTitle}`) && (categoryAnchor || categoryPath || categoryTitle)) {
    score += 0.07;
    signals.push("policy or controls wording");
  }

  return { confidence: Math.min(0.98, Math.round(score * 100) / 100), signals };
}

function linkLocation($: cheerio.CheerioAPI, element: Element): string {
  const node = $(element);
  if (node.closest("footer, [role='contentinfo']").length) return "footer";
  if (node.closest("nav, header, [role='navigation']").length) return "nav";
  return "body";
}

export function discoverPolicies(html: string, homepageUrl: string): Record<PolicyKind, PolicyCandidate | null> {
  const $ = cheerio.load(html);
  const home = new URL(homepageUrl);
  const pageTitle = $("title").first().text();
  const candidates: Record<PolicyKind, PolicyCandidate[]> = { privacy: [], cookie: [] };

  $("a[href]").each((_index, element) => {
    const rawHref = $(element).attr("href")?.trim();
    if (!rawHref || /^(?:javascript|mailto|tel|data):/i.test(rawHref)) return;

    let target: URL;
    try { target = new URL(rawHref, home); } catch { return; }
    if (target.protocol !== "http:" && target.protocol !== "https:") return;
    target.hash = "";

    const anchor = [
      $(element).text(),
      $(element).attr("aria-label") ?? "",
      $(element).attr("title") ?? "",
    ].join(" ").replace(/\s+/g, " ").trim();
    const title = $(element).attr("title") ?? "";
    const context = $(element).parent().text().slice(0, 500);
    const location = linkLocation($, element);
    for (const kind of ["privacy", "cookie"] as const) {
      const scored = scoreLink(kind, anchor, `${target.pathname} ${target.search}`, title, pageTitle, context, location);
      if (scored.confidence < MIN_CONFIDENCE) continue;
      candidates[kind].push({ url: target.toString(), confidence: scored.confidence, matchedSignals: scored.signals });
    }
  });

  const best = (kind: PolicyKind): PolicyCandidate | null => {
    const unique = new Map<string, PolicyCandidate>();
    for (const candidate of candidates[kind]) {
      const key = candidate.url.toLowerCase();
      if (!unique.has(key) || unique.get(key)!.confidence < candidate.confidence) unique.set(key, candidate);
    }
    return [...unique.values()].sort((left, right) => right.confidence - left.confidence)[0] ?? null;
  };

  const privacyPolicy = best("privacy");
  let cookiePolicy = best("cookie");
  if (privacyPolicy && cookiePolicy && privacyPolicy.url === cookiePolicy.url) {
    const otherCookie = candidates.cookie
      .filter((candidate) => candidate.url !== privacyPolicy.url)
      .sort((left, right) => right.confidence - left.confidence)[0];
    cookiePolicy = otherCookie ?? null;
  }
  return { privacy: privacyPolicy, cookie: cookiePolicy };
}

function cleanText(value: string): string {
  return value.replace(/[\u00a0\s]+/g, " ").trim();
}

function sectionReference(heading: string): string | null {
  const match = heading.match(/^(?:(?:section|article|clause)\s+)?(\d+(?:\.\d+)*(?:\([a-z0-9]+\))*)(?![a-z0-9])[.\s:–-]*/i);
  return match?.[1] ?? null;
}

function splitIntoChunks(sections: PolicySection[]): PolicyChunk[] {
  const chunks: PolicyChunk[] = [];
  for (const section of sections) {
    const lines = section.blocks.map((block) => block.text).filter(Boolean);
    let buffer = "";
    const emit = () => {
      if (!buffer.trim()) return;
      chunks.push({ index: chunks.length, section: section.reference, heading: section.heading, text: buffer.trim() });
      buffer = "";
    };
    for (const line of lines) {
      let remaining = line;
      while (remaining.length > CHUNK_SIZE) {
        const splitAt = remaining.lastIndexOf(" ", CHUNK_SIZE);
        const safeSplit = splitAt > CHUNK_SIZE / 2 ? splitAt : CHUNK_SIZE;
        const part = remaining.slice(0, safeSplit).trim();
        if (buffer && buffer.length + part.length + 1 > CHUNK_SIZE) emit();
        buffer = buffer ? `${buffer}\n${part}` : part;
        emit();
        remaining = remaining.slice(safeSplit).trim();
      }
      if (buffer && buffer.length + remaining.length + 1 > CHUNK_SIZE) emit();
      buffer = buffer ? `${buffer}\n${remaining}` : remaining;
    }
    emit();
  }
  return chunks;
}

export function extractPolicy(html: string, sourceUrl: string): ExtractedPolicy {
  const $ = cheerio.load(html);
  const title = cleanText($("title").first().text()).slice(0, 300) || null;
  const root = $("main, [role='main'], article").first().length
    ? $("main, [role='main'], article").first()
    : $("body");

  root.find("script, style, noscript, iframe, svg, canvas, nav, header, footer, aside, form, button, [aria-hidden='true'], [role='navigation'], [role='banner'], [role='contentinfo'], .cookie-banner, .cookie-consent, .advertisement, .advert, .social-share").remove();
  const sections: PolicySection[] = [];
  let current: PolicySection = { reference: null, heading: null, blocks: [], text: "" };
  const flush = () => {
    current.blocks = current.blocks.filter((block) => block.text.length > 0);
    current.text = current.blocks.map((block) => block.text).join("\n");
    if (current.text || current.heading) sections.push(current);
    current = { reference: null, heading: null, blocks: [], text: "" };
  };

  root.find("h1, h2, h3, h4, h5, h6, p, ul, ol, table, blockquote").each((_index, element) => {
    if (sections.length >= MAX_SECTIONS) return false;
    const node = $(element);
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const heading = cleanText(node.text());
      current = { reference: sectionReference(heading), heading: heading || null, blocks: [], text: "" };
      return;
    }
    if (tag === "p" && node.parents("li").length) return;
    if ((tag === "ul" || tag === "ol") && node.parents("ul, ol").length) return;
    if (tag === "table" && node.parents("table").length) return;

    let block: PolicyBlock | null = null;
    if (tag === "p") {
      const text = cleanText(node.text());
      if (text) block = { type: "paragraph", text };
    } else if (tag === "ul" || tag === "ol") {
      const items = node.children("li").map((_i, item) => cleanText($(item).text())).get().filter(Boolean);
      if (items.length) block = { type: "list", text: items.map((item) => `• ${item}`).join("\n") };
    } else if (tag === "table") {
      const rows = node.find("tr").map((_i, row) => {
        const cells = $(row).children("th, td").map((_j, cell) => cleanText($(cell).text())).get().filter(Boolean);
        return cells.join(" | ");
      }).get().filter(Boolean);
      if (rows.length) block = { type: "table", text: rows.join("\n") };
    } else if (tag === "blockquote") {
      const text = cleanText(node.text());
      if (text) block = { type: "quote", text };
    }
    if (block) current.blocks.push(block);
  });
  flush();

  let remaining = MAX_TEXT_LENGTH;
  const boundedSections = sections.slice(0, MAX_SECTIONS).map((section) => {
    const blocks: PolicyBlock[] = [];
    for (const block of section.blocks) {
      if (remaining <= 0) break;
      const text = block.text.slice(0, remaining);
      blocks.push({ ...block, text });
      remaining -= text.length;
    }
    return { ...section, blocks, text: blocks.map((block) => block.text).join("\n") };
  }).filter((section) => section.text || section.heading);
  const text = boundedSections.map((section) => [section.heading, section.text].filter(Boolean).join("\n")).join("\n\n");
  return {
    sourceUrl,
    title,
    text,
    sections: boundedSections,
    chunks: splitIntoChunks(boundedSections),
    truncated: sections.length > MAX_SECTIONS || text.length >= MAX_TEXT_LENGTH,
  };
}
