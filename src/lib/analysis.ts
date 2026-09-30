import type { ExtractedPolicy, PolicySection } from "@/lib/policies";

export type EvidenceMode = "explicit" | "inferred" | "not_found_in_text";
export type Finding = {
  category: string;
  subcategory: string;
  description: string;
  section: string | null;
  evidence: string | null;
  sourceUrl: string;
  mode: EvidenceMode;
  confidence: number;
  entities: string[];
};
export type RankedClause = {
  text: string;
  section: string | null;
  heading: string | null;
  sourceUrl: string;
  relevance: number;
};
export type AnalysisResult = {
  method: "deterministic_rules_v1";
  analyzedAt: string;
  summary: string;
  disclosureProfile: {
    label: "disclosure profile, not a trust or legal score";
    score: number;
    dimensions: Array<{ key: string; label: string; score: number; basis: string }>;
    methodology: string;
  };
  dataCollected: Finding[];
  purposes: Finding[];
  sharing: Finding[];
  tracking: Finding[];
  retention: { findings: Finding[]; status: "specific" | "partial" | "not_found_in_text" };
  userRights: Finding[];
  importantClauses: RankedClause[];
  entities: Array<{ name: string; type: string; evidence: string; sourceUrl: string }>;
  notFoundInText: Array<{ category: string; items: string[] }>;
};

type TermRule = { label: string; patterns: RegExp[]; description: string; confidence?: number };

const dataRules: TermRule[] = [
  { label: "name", patterns: [/\b(?:first|last|full) name\b/i, /\byour name\b/i, /\bname and contact details\b/i], description: "The policy mentions collecting a name." },
  { label: "email", patterns: [/\be-?mail address(?:es)?\b/i, /\bemail\b/i], description: "The policy mentions collecting an email address." },
  { label: "phone", patterns: [/\b(?:telephone|mobile|phone) number(?:s)?\b/i], description: "The policy mentions collecting a phone number." },
  { label: "address", patterns: [/\b(?:mailing|postal|billing|home) address(?:es)?\b/i], description: "The policy mentions collecting an address." },
  { label: "location", patterns: [/\b(?:precise|approximate|geographic|device) location\b/i, /\blocation data\b/i], description: "The policy mentions location information." },
  { label: "IP address", patterns: [/\bIP addresses?\b/i, /\binternet protocol address\b/i], description: "The policy mentions IP addresses." },
  { label: "device information", patterns: [/\bdevice (?:information|data|identifiers?)\b/i, /\bbrowser type\b/i, /\boperating system\b/i], description: "The policy mentions device or browser information." },
  { label: "identifiers", patterns: [/\b(?:unique|online|advertising|device|cookie) identifiers?\b/i, /\bidentifiers?\b/i], description: "The policy mentions identifiers that may distinguish a user or device." },
  { label: "authentication information", patterns: [/\b(?:passwords?|login credentials|authentication information|account credentials)\b/i], description: "The policy mentions account authentication information." },
  { label: "financial information", patterns: [/\bfinancial information\b/i, /\bbank account (?:number|details)\b/i], description: "The policy mentions financial information." },
  { label: "payment information", patterns: [/\bpayment (?:card|information|details|data)\b/i, /\bcredit card\b/i, /\bdebit card\b/i], description: "The policy mentions payment information." },
  { label: "browsing activity", patterns: [/\b(?:browsing|browser|online) activity\b/i, /\bpages? (?:you )?visit(?:ed)?\b/i, /\bclickstream\b/i], description: "The policy mentions browsing or page-visit activity." },
  { label: "search activity", patterns: [/\bsearch (?:queries|history|activity|terms)\b/i], description: "The policy mentions search activity." },
  { label: "purchase history", patterns: [/\b(?:purchase|order|transaction) histor(?:y|ies)\b/i, /\bitems? (?:you )?(?:buy|purchase)\b/i], description: "The policy mentions purchase or order history." },
  { label: "communications", patterns: [/\b(?:messages?|communications?|support requests?|correspondence)\b/i], description: "The policy mentions communications or support correspondence." },
  { label: "behavioral information", patterns: [/\bbehavior(?:al)? (?:information|data|activity)\b/i, /\binterests and preferences\b/i], description: "The policy mentions behavioral information or inferred interests." },
  { label: "biometric information", patterns: [/\bbiometric(?:s| information| data)?\b/i, /\bfingerprints?\b/i, /\bvoiceprints?\b/i], description: "The policy mentions biometric information." },
  { label: "health information", patterns: [/\bhealth (?:information|data|records?)\b/i, /\bmedical information\b/i], description: "The policy mentions health or medical information." },
  { label: "sensitive information", patterns: [/\bsensitive personal (?:information|data)\b/i, /\bspecial categories of personal data\b/i], description: "The policy explicitly mentions sensitive personal information." },
];

const purposeRules: TermRule[] = [
  { label: "account management", patterns: [/\bmanage (?:your )?account\b/i, /\baccount (?:creation|management|administration)\b/i, /\bregister(?:ation)?\b/i], description: "The policy links information use to creating or managing accounts." },
  { label: "service delivery", patterns: [/\bprovide (?:our )?(?:services?|products?)\b/i, /\bdeliver (?:the )?services?\b/i, /\boperate (?:our )?services?\b/i], description: "The policy links information use to delivering or operating services." },
  { label: "analytics", patterns: [/\banalytics?\b/i, /\bmeasure (?:usage|performance|traffic)\b/i], description: "The policy mentions analytics or service measurement." },
  { label: "personalization", patterns: [/\bpersonaliz(?:e|ation|ed)\b/i, /\btailor (?:content|experience|recommendations)\b/i], description: "The policy mentions tailoring content or experiences." },
  { label: "advertising", patterns: [/\badvertis(?:e|ing|ements?)\b/i, /\btargeted ads?\b/i], description: "The policy mentions advertising or ad targeting." },
  { label: "marketing", patterns: [/\bmarketing\b/i, /\bpromotional (?:emails?|communications?)\b/i], description: "The policy mentions marketing or promotional communications." },
  { label: "security", patterns: [/\bsecurity\b/i, /\bprotect (?:our )?(?:services?|systems?|users?)\b/i], description: "The policy mentions security-related processing." },
  { label: "fraud prevention", patterns: [/\bfraud prevention\b/i, /\bdetect and prevent fraud\b/i, /\babuse prevention\b/i], description: "The policy mentions fraud or abuse prevention." },
  { label: "payments", patterns: [/\bprocess payments?\b/i, /\bbilling\b/i, /\bpayment processing\b/i], description: "The policy mentions payment processing or billing." },
  { label: "legal compliance", patterns: [/\blegal obligations?\b/i, /\bcomply with (?:applicable )?laws?\b/i, /\blegal compliance\b/i], description: "The policy mentions legal or regulatory compliance." },
  { label: "product improvement", patterns: [/\bimprov(?:e|ement|ing) (?:our )?(?:products?|services?|features?)\b/i, /\bdevelop new features\b/i], description: "The policy mentions improving products or services." },
];

const sharingRules: TermRule[] = [
  { label: "service providers", patterns: [/\bservice providers?\b/i, /\b(?:vendors?|processors?) acting on our behalf\b/i], description: "The policy mentions sharing with service providers." },
  { label: "affiliates", patterns: [/\baffiliates?\b/i, /\bsubsidiaries\b/i], description: "The policy mentions sharing within an affiliated company group." },
  { label: "advertisers", patterns: [/\badvertisers?\b/i, /\badvertising partners?\b/i], description: "The policy mentions sharing with advertisers or advertising partners." },
  { label: "analytics providers", patterns: [/\banalytics providers?\b/i, /\banalytics partners?\b/i], description: "The policy mentions third-party analytics providers." },
  { label: "payment processors", patterns: [/\bpayment processors?\b/i, /\bpayment service providers?\b/i], description: "The policy mentions payment processors." },
  { label: "business partners", patterns: [/\bbusiness partners?\b/i, /\bcommercial partners?\b/i], description: "The policy mentions sharing with business partners." },
  { label: "government authorities", patterns: [/\bgovernment (?:agencies|authorities|entities)\b/i, /\blaw enforcement\b/i, /\bpublic authorities\b/i], description: "The policy mentions disclosures to public authorities or law enforcement." },
  { label: "business transfers", patterns: [/\bmergers?\b/i, /\bacquisitions?\b/i, /\bsale of (?:all or part of )?(?:our )?(?:business|assets)\b/i, /\bbusiness transfers?\b/i], description: "The policy mentions disclosure in connection with a business transfer." },
  { label: "other third parties", patterns: [/\bthird parties\b/i, /\bother companies\b/i], description: "The policy mentions sharing with other third parties." },
];

const trackingRules: TermRule[] = [
  { label: "cookies", patterns: [/\bcookies?\b/i], description: "The policy mentions cookies." },
  { label: "analytics", patterns: [/\banalytics\b/i, /\bmeasurement technologies\b/i], description: "The policy mentions analytics or measurement technologies." },
  { label: "advertising", patterns: [/\badvertising cookies?\b/i, /\badvertising technologies\b/i, /\btargeted advertising\b/i], description: "The policy mentions advertising-related tracking." },
  { label: "pixels", patterns: [/\btracking pixels?\b/i, /\bweb beacons?\b/i, /\bpixels? tags?\b/i], description: "The policy mentions pixels or web beacons." },
  { label: "fingerprinting", patterns: [/\bfingerprinting\b/i, /\bbrowser fingerprint\b/i], description: "The policy mentions fingerprinting." },
  { label: "device identifiers", patterns: [/\bdevice identifiers?\b/i, /\badvertising identifiers?\b/i], description: "The policy mentions device or advertising identifiers." },
  { label: "local storage", patterns: [/\blocal storage\b/i, /\blocalstorage\b/i, /\bdevice storage\b/i], description: "The policy mentions local or device storage." },
  { label: "third-party tracking", patterns: [/\bthird.party (?:cookies?|tracking|trackers?)\b/i, /\btrack(?:ed|ing) across (?:different )?(?:websites|sites)\b/i], description: "The policy mentions third-party or cross-site tracking." },
];

const rightsRules: TermRule[] = [
  { label: "access", patterns: [/\bright to access\b/i, /\brequest access to\b/i, /\baccess your personal (?:data|information)\b/i], description: "The text describes an access right or process." },
  { label: "correction", patterns: [/\bright to (?:correct|rectif\w+)\b/i, /\bcorrect inaccurate\b/i, /\bupdate your information\b/i], description: "The text describes a correction or update right." },
  { label: "deletion", patterns: [/\bright to (?:delete|erase)\b/i, /\brequest (?:the )?deletion\b/i, /\berasure of your (?:data|information)\b/i], description: "The text describes a deletion or erasure right." },
  { label: "portability", patterns: [/\bdata portability\b/i, /\bright to portability\b/i, /\bportable copy\b/i], description: "The text describes data portability." },
  { label: "objection", patterns: [/\bright to object\b/i, /\bobject to (?:the )?processing\b/i], description: "The text describes a right to object to processing." },
  { label: "restriction", patterns: [/\bright to restrict\b/i, /\brestrict processing\b/i], description: "The text describes a right to restrict processing." },
  { label: "opt-out", patterns: [/\bright to opt out\b/i, /\bopt[- ]out of\b/i, /\bdo not sell or share\b/i], description: "The text describes an opt-out choice." },
  { label: "withdrawal of consent", patterns: [/\bwithdraw (?:your )?consent\b/i, /\bwithdrawal of consent\b/i], description: "The text describes withdrawing consent." },
  { label: "appeal", patterns: [/\bright to appeal\b/i, /\bappeal (?:our|a) decision\b/i], description: "The text describes an appeal process." },
];

const durationPattern = /\b(?:for\s+)?(?:up to\s+)?\d+\s*(?:days?|weeks?|months?|years?)\b|\b(?:six|twelve|twenty-four)\s+months?\b/i;
const durationEvents = /\b(?:as long as|until|while)\s+(?:your )?(?:account|contract|relationship|purpose|law requires)[^.!?;]{0,100}/i;
const namedEntityPatterns: Array<{ type: string; pattern: RegExp }> = [
  { type: "company or product", pattern: /\b(?:Google Analytics|Google|Meta|Facebook|Instagram|TikTok|Microsoft|Amazon|Apple|Adobe|Salesforce|HubSpot|Cloudflare|Stripe|PayPal|LinkedIn|X\.com)\b/g },
  { type: "authority or regulator", pattern: /\b(?:Federal Trade Commission|FTC|Information Commissioner's Office|ICO|European Data Protection Board|EDPB|Attorney General)\b/g },
  { type: "service category", pattern: /\b(?:hosting provider|payment processor|analytics provider|advertising partner|cloud provider|service provider)\b/gi },
];

const stopWords = new Set("a an and are as at be been by can could did do for from had has have if in into is it its may of on or our own shall should that the their them then there these they this to was we were will with would you your i about after also any each not only other such through use using when where which who why while than more information personal collect collected collecting share shared sharing provide including include may for purposes service services data policy from website rights company third parties".split(/\s+/));

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g)?.filter((word) => !stopWords.has(word)) ?? [];
}

function sentenceSplit(text: string): string[] {
  return text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 35) ?? [];
}

function sectionLabel(section: PolicySection): string | null {
  if (section.reference && section.heading) return `${section.reference} ${section.heading}`;
  return section.reference ?? section.heading;
}

function textSentences(policies: ExtractedPolicy[]) {
  return policies.flatMap((policy) => policy.sections.flatMap((section) => sentenceSplit(section.text).map((text) => ({
    text,
    section: sectionLabel(section),
    heading: section.heading,
    sourceUrl: policy.sourceUrl,
  }))));
}

function isNegatedMatch(sentence: string, rule: TermRule): boolean {
  let matchedTerm = false;
  let positiveMatch = false;
  for (const pattern of rule.patterns) {
    for (const match of sentence.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
      matchedTerm = true;
      const prefix = sentence.slice(0, match.index ?? 0).split(/\bbut\b|[;.!?]/i).at(-1) ?? "";
      if (!/\b(?:do not|does not|did not|don't|doesn't|didn't|never|no longer)\s+(?:collect|gather|request|store|process|share|sell|use|retain|track)(?:\s+\w+){0,5}\s*$/i.test(prefix)) positiveMatch = true;
    }
  }
  return matchedTerm && !positiveMatch;
}

function bestEvidence(policies: ExtractedPolicy[], rule: TermRule): { evidence: string; section: string | null; sourceUrl: string } | null {
  const matches = textSentences(policies).filter((sentence) =>
    rule.patterns.some((pattern) => pattern.test(sentence.text)) && !isNegatedMatch(sentence.text, rule),
  );
  if (matches.length === 0) {
    for (const policy of policies) {
      const section = policy.sections.find((item) => rule.patterns.some((pattern) => pattern.test(item.text)) && !isNegatedMatch(item.text, rule));
      if (section) return { evidence: section.text.slice(0, 500), section: sectionLabel(section), sourceUrl: policy.sourceUrl };
    }
    return null;
  }
  const match = matches.sort((left, right) => left.text.length - right.text.length)[0];
  return { evidence: match.text.slice(0, 500), section: match.section, sourceUrl: match.sourceUrl };
}

function findingsFor(policies: ExtractedPolicy[], category: string, rules: TermRule[]): Finding[] {
  return rules.flatMap((rule) => {
    const evidence = bestEvidence(policies, rule);
    return evidence ? [{
      category,
      subcategory: rule.label,
      description: rule.description,
      section: evidence.section,
      evidence: evidence.evidence,
      sourceUrl: evidence.sourceUrl,
      mode: "explicit" as const,
      confidence: rule.confidence ?? 0.85,
      entities: extractEntities(evidence.evidence).map((entity) => entity.name),
    }] : [];
  });
}

function extractEntities(text: string): Array<{ name: string; type: string }> {
  const found = new Map<string, { name: string; type: string }>();
  for (const { type, pattern } of namedEntityPatterns) {
    for (const match of text.matchAll(pattern)) {
      const name = match[0].trim();
      if (name) found.set(name.toLowerCase(), { name, type });
    }
  }
  return [...found.values()];
}

function scoreSentencesWithTfIdf(sentences: ReturnType<typeof textSentences>): number[] {
  const tokenized = sentences.map((item) => tokenize(item.text));
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const count = Math.max(1, sentences.length);
  return tokenized.map((tokens, index) => {
    const counts = new Map<string, number>();
    for (const term of tokens) counts.set(term, (counts.get(term) ?? 0) + 1);
    let score = 0;
    for (const [term, termCount] of counts) {
      const tf = termCount / Math.max(1, tokens.length);
      const idf = Math.log(1 + count / (1 + (documentFrequency.get(term) ?? 0)));
      score += tf * idf;
    }
    const text = sentences[index].text;
    const signalTerms = /\b(collect|use|share|retain|delete|store|sell|disclose|track|cookie|advertis|consent|right|request|personal data|personal information)\w*\b/i.test(text);
    return score + (signalTerms ? 0.18 : 0) + (sentences[index].section ? 0.04 : 0);
  });
}

function textRank(sentences: ReturnType<typeof textSentences>, iterations = 12): number[] {
  const tokenized = sentences.map((sentence) => new Set(tokenize(sentence.text)));
  if (!sentences.length) return [];
  const similarity = (left: Set<string>, right: Set<string>) => {
    if (left.size === 0 || right.size === 0) return 0;
    let shared = 0;
    for (const term of left) if (right.has(term)) shared += 1;
    return shared / (Math.log(left.size + 1) + Math.log(right.size + 1));
  };
  const edges = tokenized.map((tokens, i) => tokenized.map((other, j) => i === j ? 0 : similarity(tokens, other)));
  let ranks = sentences.map(() => 1);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    ranks = ranks.map((_rank, node) => {
      let sum = 0;
      for (let source = 0; source < sentences.length; source += 1) {
        const weight = edges[source][node];
        const total = edges[source].reduce((value, next) => value + next, 0);
        if (weight && total) sum += ranks[source] * weight / total;
      }
      return 0.15 + 0.85 * sum;
    });
  }
  const maximum = Math.max(...ranks, 1);
  return ranks.map((rank) => rank / maximum);
}

function rankClauses(policies: ExtractedPolicy[], limit = 7): RankedClause[] {
  const sentences = textSentences(policies);
  if (!sentences.length) return [];
  const tfidf = scoreSentencesWithTfIdf(sentences);
  const candidateIndices = sentences.map((_sentence, index) => index)
    .sort((left, right) => tfidf[right] - tfidf[left])
    .slice(0, 200);
  const candidates = candidateIndices.map((index) => sentences[index]);
  const rank = textRank(candidates);
  return candidates.map((sentence, index) => ({
    ...sentence,
    relevance: Math.round((0.55 * rank[index] + 0.45 * tfidf[candidateIndices[index]] / Math.max(...tfidf, 1)) * 1000) / 1000,
  })).sort((left, right) => right.relevance - left.relevance).slice(0, limit);
}

function findRetention(policies: ExtractedPolicy[]): { findings: Finding[]; status: AnalysisResult["retention"]["status"] } {
  const rules: TermRule[] = [
    { label: "explicit period", patterns: [durationPattern], description: "The text names a numeric retention period." },
    { label: "event-based", patterns: [durationEvents], description: "The text ties retention to an event or condition." },
    { label: "account lifetime", patterns: [/\b(?:as long as|while) (?:you have )?(?:an? )?account\b/i, /\bfor the duration of your account\b/i], description: "The text ties retention to the lifetime of an account." },
    { label: "deletion-based", patterns: [/\buntil (?:you )?(?:delete|close) your account\b/i, /\buntil deletion\b/i], description: "The text ties retention to account or data deletion." },
    { label: "indefinite or unspecified", patterns: [/\bindefinitely\b/i, /\bas long as necessary\b/i, /\bfor as long as (?:is )?necessary\b/i], description: "The text uses a necessity-based or indefinite retention formulation." },
  ];
  const findings = findingsFor(policies, "retention", rules);
  const specific = findings.some((finding) => finding.subcategory === "explicit period");
  const hasOther = findings.length > 0;
  return { findings, status: specific ? "specific" : hasOther ? "partial" : "not_found_in_text" };
}

function extractEntitiesFromPolicies(policies: ExtractedPolicy[]) {
  const entities = new Map<string, { name: string; type: string; evidence: string; sourceUrl: string }>();
  for (const sentence of textSentences(policies)) {
    for (const entity of extractEntities(sentence.text)) {
      const key = `${entity.type}:${entity.name.toLowerCase()}`;
      if (!entities.has(key)) entities.set(key, { ...entity, evidence: sentence.text, sourceUrl: sentence.sourceUrl });
    }
  }
  return [...entities.values()].slice(0, 40);
}

function profile(policies: ExtractedPolicy[], data: Finding[], purposes: Finding[], sharing: Finding[], tracking: Finding[], retention: Finding[], rights: Finding[]): AnalysisResult["disclosureProfile"] {
  const privacyFound = policies.some((policy) => /privacy|data protection/i.test(`${policy.title ?? ""} ${policy.sourceUrl}`));
  const cookieFound = policies.some((policy) => /cookie/i.test(`${policy.title ?? ""} ${policy.sourceUrl}`));
  const breadth = (findings: Finding[], total: number) => Math.round(Math.min(100, findings.length / total * 100));
  const retentionScore = retention.some((item) => item.subcategory === "explicit period") ? 100 : retention.length ? 55 : 0;
  const dimensions = [
    { key: "policyAccess", label: "Policy access", score: Math.round((Number(privacyFound) * 70 + Number(cookieFound) * 30)), basis: `${Number(privacyFound)} privacy and ${Number(cookieFound)} cookie policy document(s) extracted.` },
    { key: "dataCategories", label: "Data-category coverage", score: breadth(data, dataRules.length), basis: `${data.length} of ${dataRules.length} tracked data categories were found in the scanned text.` },
    { key: "purposeCategories", label: "Purpose coverage", score: breadth(purposes, purposeRules.length), basis: `${purposes.length} of ${purposeRules.length} tracked purposes were found in the scanned text.` },
    { key: "sharingCategories", label: "Sharing-category coverage", score: breadth(sharing, sharingRules.length), basis: `${sharing.length} of ${sharingRules.length} tracked recipient categories were found in the scanned text.` },
    { key: "rightsCategories", label: "Rights coverage", score: breadth(rights, rightsRules.length), basis: `${rights.length} of ${rightsRules.length} tracked rights were found in the scanned text.` },
    { key: "trackingCategories", label: "Tracking disclosure coverage", score: breadth(tracking, trackingRules.length), basis: `${tracking.length} of ${trackingRules.length} tracking terms were found in the scanned text.` },
    { key: "retentionSpecificity", label: "Retention specificity", score: retentionScore, basis: retentionScore === 100 ? "A numeric retention period was found." : retentionScore ? "A retention condition was found, but no numeric period." : "No retention condition was found in the scanned text." },
  ];
  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  return {
    label: "disclosure profile, not a trust or legal score",
    score,
    dimensions,
    methodology: "Equal-weight average of seven observable disclosure dimensions. Scores measure only terms detected in the scanned policy text; they do not measure actual practices, legal compliance, safety, or trustworthiness.",
  };
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function analyzePolicies(policies: ExtractedPolicy[], observedPolicyCount = policies.length): AnalysisResult {
  const dataCollected = findingsFor(policies, "data_collected", dataRules);
  const purposes = findingsFor(policies, "purpose", purposeRules);
  const sharing = findingsFor(policies, "sharing", sharingRules);
  const tracking = findingsFor(policies, "tracking", trackingRules);
  const retentionResult = findRetention(policies);
  const userRights = findingsFor(policies, "user_right", rightsRules);
  const requiredGroups = [
    { category: "data collected", total: dataRules, present: dataCollected },
    { category: "purposes", total: purposeRules, present: purposes },
    { category: "sharing recipients", total: sharingRules, present: sharing },
    { category: "tracking technologies", total: trackingRules, present: tracking },
    { category: "retention", total: [{ label: "retention details" }], present: retentionResult.findings },
    { category: "user rights", total: rightsRules, present: userRights },
  ];
  const notFoundInText = requiredGroups.map((group) => ({
    category: group.category,
    items: group.category === "retention" && group.present.length > 0
      ? []
      : group.total.map((rule) => rule.label).filter((label) => !group.present.some((finding) => finding.subcategory === label)),
  })).filter((group) => group.items.length > 0);
  return {
    method: "deterministic_rules_v1",
    analyzedAt: new Date().toISOString(),
    summary: `${countLabel(observedPolicyCount, "policy page", "policy pages")} extracted. The scanned text explicitly mentions ${countLabel(dataCollected.length, "data category", "data categories")}, ${countLabel(purposes.length, "purpose", "purposes")}, ${countLabel(sharing.length, "sharing recipient category", "sharing recipient categories")}, ${countLabel(tracking.length, "tracking category", "tracking categories")}, ${countLabel(retentionResult.findings.length, "retention condition", "retention conditions")}, and ${countLabel(userRights.length, "user right", "user rights")}. Categories marked not found were not matched in the scanned text; that does not establish they are absent from actual practices.`,
    disclosureProfile: profile(policies, dataCollected, purposes, sharing, tracking, retentionResult.findings, userRights),
    dataCollected,
    purposes,
    sharing,
    tracking,
    retention: retentionResult,
    userRights,
    importantClauses: rankClauses(policies),
    entities: extractEntitiesFromPolicies(policies),
    notFoundInText,
  };
}
