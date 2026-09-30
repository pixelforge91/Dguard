"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import DguardGuardian from "./components/DguardGuardian";

type ScanResult = {
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  title: string | null;
  statusCode: number;
  contentType: string;
  bytesRead: number;
  policies: Record<"privacy" | "cookie", PolicyResult>;
  analysis: AnalysisReport;
  observation: TechnicalObservation;
};

type ReportFinding = {
  category: string;
  subcategory: string;
  description: string;
  section: string | null;
  evidence: string | null;
  sourceUrl: string;
  mode: "explicit" | "inferred" | "not_found_in_text";
  confidence: number;
  entities: string[];
};

type AnalysisReport = {
  method: string;
  analyzedAt: string;
  summary: string;
  disclosureProfile: {
    label: string;
    score: number;
    dimensions: Array<{ key: string; label: string; score: number; basis: string }>;
    methodology: string;
  };
  dataCollected: ReportFinding[];
  purposes: ReportFinding[];
  sharing: ReportFinding[];
  tracking: ReportFinding[];
  retention: { findings: ReportFinding[]; status: string };
  userRights: ReportFinding[];
  importantClauses: Array<{ text: string; section: string | null; heading: string | null; sourceUrl: string; relevance: number }>;
  entities: Array<{ name: string; type: string; evidence: string; sourceUrl: string }>;
  notFoundInText: Array<{ category: string; items: string[] }>;
};

type TechnicalObservation = {
  status: "observed" | "unavailable";
  capturedAt: string;
  cookies: Array<{ name: string; domain: string; type: string; source: string; path: string; expires: number | null; httpOnly: boolean; secure: boolean; sameSite: string | null }>;
  storage: Array<{ origin: string; localStorageKeys: string[]; sessionStorageKeys: string[] }>;
  thirdPartyRequests: Array<{ hostname: string; type: string; categories: string[]; sampleUrl: string }>;
  requestCount: number;
  note: string | null;
};

type PolicyResult = {
  candidate: { url: string; confidence: number; matchedSignals: string[] } | null;
  policy: {
    sourceUrl: string;
    title: string | null;
    text: string;
    sections: Array<{
      reference: string | null;
      heading: string | null;
      blocks: Array<{ type: string; text: string }>;
      text: string;
    }>;
    truncated: boolean;
  } | null;
  error: string | null;
};

function PolicyReport({ label, result }: { label: string; result: PolicyResult }) {
  return (
    <section className="policy-report" aria-label={`${label} report`}>
      <div className="policy-report-head">
        <div>
          <p className="eyebrow">{label.toUpperCase()}</p>
          <h4>{result.policy?.title ?? (result.candidate ? "Policy page found" : "No policy link found")}</h4>
        </div>
        {result.candidate && <span className="confidence">{Math.round(result.candidate.confidence * 100)}% match</span>}
      </div>
      {result.candidate && (
        <a className="policy-source" href={result.policy?.sourceUrl ?? result.candidate.url} target="_blank" rel="noreferrer">
          {result.policy?.sourceUrl ?? result.candidate.url} <span aria-hidden="true">↗</span>
        </a>
      )}
      {result.error && <p className="policy-error">{result.error}</p>}
      {result.policy && (
        <>
          <p className="policy-count">{result.policy.sections.length} structured sections extracted{result.policy.truncated ? " · content limit reached" : ""}</p>
          <div className="policy-sections">
            {result.policy.sections.map((section, index) => (
              <details className="policy-section" key={`${section.reference ?? "section"}-${index}`}>
                <summary>
                  <span>{section.reference ? `Section ${section.reference}` : section.heading ?? "Policy text"}</span>
                  {section.reference && section.heading && <span className="section-title">{section.heading}</span>}
                </summary>
                {section.blocks.map((block, blockIndex) => <p className="policy-block" key={blockIndex}>{block.text}</p>)}
              </details>
            ))}
          </div>
        </>
      )}
      {!result.candidate && <p className="policy-count">No confident link was found on the homepage.</p>}
    </section>
  );
}

function FindingGroup({ label, findings }: { label: string; findings: ReportFinding[] }) {
  return (
    <section className="finding-group">
      <div className="finding-group-head"><h4>{label}</h4><span>{findings.length}</span></div>
      {findings.length === 0 ? <p className="empty-note">No matching statement found in the extracted text.</p> : findings.map((finding) => (
        <details className="finding-item" key={`${finding.category}-${finding.subcategory}`}>
          <summary>{finding.subcategory}<span className="finding-mode">POLICY TEXT</span></summary>
          <p>{finding.description}</p>
          {finding.section && <p className="evidence-section">Section {finding.section}</p>}
          {finding.evidence && <blockquote>{finding.evidence}</blockquote>}
          <a href={finding.sourceUrl} target="_blank" rel="noreferrer">View source policy ↗</a>
        </details>
      ))}
    </section>
  );
}

function AnalysisReportView({ analysis }: { analysis: AnalysisReport }) {
  return (
    <section className="analysis-report" aria-label="Deterministic privacy report">
      <div className="report-section-heading">
        <div><p className="eyebrow">DETERMINISTIC POLICY REVIEW</p><h3>What the text says</h3></div>
        <span className="method-tag">SOURCE BASED REVIEW</span>
      </div>
      <p className="analysis-summary">{analysis.summary}</p>
      <section className="profile-panel" aria-label="Disclosure profile, not a trust score">
        <div className="profile-topline">
          <div><p className="eyebrow">TRANSPARENCY PROFILE</p><p className="profile-caveat">Disclosure coverage only · not a trust, safety, or legal score</p></div>
          <div className="profile-score"><strong>{analysis.disclosureProfile.score}</strong><span>/ 100</span></div>
        </div>
        <div className="profile-dimensions">
          {analysis.disclosureProfile.dimensions.map((dimension) => (
            <div className="dimension" key={dimension.key}>
              <div className="dimension-label"><span>{dimension.label}</span><strong>{dimension.score}</strong></div>
              <div className="dimension-track" role="meter" aria-label={dimension.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={dimension.score}><span style={{ width: `${dimension.score}%` }} /></div>
              <p>{dimension.basis}</p>
            </div>
          ))}
        </div>
        <p className="methodology">{analysis.disclosureProfile.methodology}</p>
      </section>
      <div className="finding-grid">
        <FindingGroup label="Data collected" findings={analysis.dataCollected} />
        <FindingGroup label="Purposes" findings={analysis.purposes} />
        <FindingGroup label="Sharing" findings={analysis.sharing} />
        <FindingGroup label="Tracking in policy" findings={analysis.tracking} />
      </div>
      <div className="finding-grid rights-grid">
        <FindingGroup label={`Retention · ${analysis.retention.status.replaceAll("_", " ")}`} findings={analysis.retention.findings} />
        <FindingGroup label="User rights" findings={analysis.userRights} />
      </div>
      <section className="clauses-report">
        <div className="report-section-heading"><div><p className="eyebrow">RANKED BY TEXT SIGNALS</p><h3>Clauses worth reading</h3></div><span className="method-tag">TF-IDF + TEXTRANK</span></div>
        {analysis.importantClauses.map((clause, index) => (
          <article className="clause-item" key={`${clause.sourceUrl}-${index}`}>
            <div className="clause-meta"><span>{clause.section ?? clause.heading ?? "Policy clause"}</span><span>Signal {Math.round(clause.relevance * 100)}%</span></div>
            <p>{clause.text}</p>
            <a href={clause.sourceUrl} target="_blank" rel="noreferrer">View policy source ↗</a>
          </article>
        ))}
      </section>
      {analysis.notFoundInText.length > 0 && (
        <details className="not-found-report">
          <summary>Categories not found in scanned text</summary>
          <p>This means no matching phrase was found in the extracted pages. It does not prove the organization does not collect or do these things.</p>
          {analysis.notFoundInText.map((group) => <p key={group.category}><strong>{group.category}:</strong> {group.items.join(", ")}</p>)}
        </details>
      )}
      {analysis.entities.length > 0 && (
        <details className="entities-report"><summary>Named entities detected by rules ({analysis.entities.length})</summary>
          {analysis.entities.map((entity) => <p key={`${entity.type}-${entity.name}`}><strong>{entity.name}</strong> · {entity.type} · <a href={entity.sourceUrl} target="_blank" rel="noreferrer">source</a></p>)}
        </details>
      )}
    </section>
  );
}

function ObservationReport({ observation }: { observation: TechnicalObservation }) {
  return (
    <section className="observation-report" aria-label="Observed during scan">
      <div className="report-section-heading">
        <div><p className="eyebrow">LIVE SITE SIGNALS</p><h3>Observed during scan</h3></div>
        <span className={`observation-status ${observation.status}`}>{observation.status === "observed" ? "CAPTURED" : "NOT AVAILABLE"}</span>
      </div>
      <p className="observation-note">These are technical signals observed during one unauthenticated scan. They are separate from website policy declarations and do not establish a complete inventory or legal conclusion.</p>
      {observation.note && <p className="policy-error">{observation.note}</p>}
      <div className="observation-grid">
        <section><div className="finding-group-head"><h4>Cookies</h4><span>{observation.cookies.length}</span></div>
          {observation.cookies.length ? observation.cookies.map((cookie) => <p className="observed-row" key={`${cookie.domain}-${cookie.name}`}><strong>{cookie.name}</strong><span>{cookie.domain} · {cookie.type}</span><small>{cookie.secure ? "Secure" : "Not Secure flag"} · {cookie.httpOnly ? "HttpOnly" : "JavaScript-accessible"}{cookie.sameSite ? ` · SameSite ${cookie.sameSite}` : ""}</small></p>) : <p className="empty-note">No cookies captured.</p>}
        </section>
        <section><div className="finding-group-head"><h4>Browser storage keys</h4><span>{observation.storage.reduce((count, item) => count + item.localStorageKeys.length + item.sessionStorageKeys.length, 0)}</span></div>
          {observation.storage.map((item) => <div className="storage-row" key={item.origin}><strong>{item.origin}</strong><p>localStorage: {item.localStorageKeys.join(", ") || "none"}</p><p>sessionStorage: {item.sessionStorageKeys.join(", ") || "none"}</p></div>)}
          {!observation.storage.length && <p className="empty-note">No storage keys captured.</p>}
        </section>
      </div>
      <section className="third-party-report"><div className="finding-group-head"><h4>Third-party request domains</h4><span>{observation.thirdPartyRequests.length}</span></div>
        {observation.thirdPartyRequests.map((request) => <p className="observed-domain" key={request.hostname}><strong>{request.hostname}</strong><span>{request.type}</span>{request.categories.map((category) => <small key={category}>{category}</small>)}</p>)}
        {!observation.thirdPartyRequests.length && <p className="empty-note">No third-party requests captured.</p>}
      </section>
      <p className="observation-timestamp">Captured {new Date(observation.capturedAt).toLocaleString()} · {observation.requestCount} browser requests observed</p>
    </section>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90_000);
    setBusy(true);
    setScanComplete(false);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const responseText = await response.text();
      let payload: { error?: string } & Partial<ScanResult>;
      try {
        payload = JSON.parse(responseText);
      } catch {
        throw new Error(response.ok
          ? "The scan service returned an unreadable response. Please try again."
          : `The scan service could not complete this request (HTTP ${response.status}). Please try again.`);
      }
      if (!response.ok) throw new Error(payload.error ?? `The site could not be checked (HTTP ${response.status}).`);
      if (!payload.domain || !payload.analysis || !payload.policies || !payload.observation) {
        throw new Error("The scan response was incomplete. Please try again.");
      }
      setResult(payload as ScanResult);
      setScanComplete(true);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        setError("The scan took too long. Try again, or check a simpler public webpage.");
      } else if (caught instanceof TypeError) {
        setError("Could not reach the scan service. Check your connection and try again.");
      } else {
        setError(caught instanceof Error ? caught.message : "The site could not be checked. Please try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Dguard home">
          <span className="brand-mark" aria-hidden="true"><span /></span><span>dguard</span>
        </Link>
        <div className="topbar-right"><span className="topbar-note"><span className="status-dot" /> PRIVACY INTELLIGENCE</span><a className="topbar-link" href="#how-it-works">How it works</a></div>
      </header>
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="live-mark" /> DIGITAL PRIVACY GUARDIAN</div>
          <h1 id="page-title">Meet your<br /><span>privacy guardian.</span></h1>
          <p className="intro">Dguard reads the policies behind the websites you use, then shows what they say in plain, source linked terms.</p>
          <div className="hero-proof"><span className="proof-emblem">D</span><p><strong>Clarity with receipts.</strong><br />Every finding points back to the policy text.</p></div>
        </div>
      </section>

      <section className="scan-section" id="analyze" aria-labelledby="scan-title">
        <div className="scan-section-head">
          <div><p className="eyebrow">A CLEARER LOOK AT THE FINE PRINT</p><h2 id="scan-title">Start with a website.</h2></div>
          <p>Public pages only. No account access. No generative AI.</p>
        </div>
        <div className="scan-panel">
          <div className="panel-heading">
            <div className="panel-title"><p className="eyebrow">WEBSITE POLICY SCAN</p><h3>{busy ? "Dguard is reading." : "What does it disclose?"}</h3></div>
            <span className={`scan-state ${busy ? "active" : scanComplete ? "complete" : ""}`}><span />{busy ? "SCANNING" : scanComplete ? "COMPLETE" : "READY"}</span>
          </div>
          <div className={`guardian-signature${busy ? " is-scanning" : ""}${scanComplete ? " is-complete" : ""}`} aria-label={busy ? "Dguard is considering the policy" : scanComplete ? "Dguard scan complete" : "Dguard guardian"}>
            <DguardGuardian active={busy} complete={scanComplete} />
            <span className="guardian-signature-caption">{busy ? "REVIEWING" : scanComplete ? "READY" : "ON GUARD"}</span>
          </div>
          <form onSubmit={analyze}>
            <label htmlFor="site-url">Website address</label>
            <div className="input-row">
              <span className="url-prefix" aria-hidden="true">https://</span>
              <input id="site-url" type="text" inputMode="url" autoComplete="url" placeholder="example.com" value={url} onChange={(event) => { setUrl(event.target.value); setScanComplete(false); }} required aria-describedby="url-help" />
              <button type="submit" disabled={busy}>{busy ? "Scanning" : "Scan website"}</button>
            </div>
            <p id="url-help" className="form-note"><span className="form-lock" aria-hidden="true" />Only public websites. We never sign in or change your preferences.</p>
          </form>
          {error && <p className="feedback feedback-error" role="alert">{error}</p>}
          {result && (
            <section className="result" aria-live="polite" aria-label="Website check result">
              <div className="result-head">
                <span className="result-check" aria-hidden="true">✓</span>
                <div><p className="eyebrow">SCAN REPORT</p><h3>{result.domain}</h3></div>
                <span className="http-status">HTTP {result.statusCode}</span>
              </div>
              <dl className="result-details">
                <div><dt>Page title</dt><dd>{result.title ?? "No title found"}</dd></div>
                <div><dt>Final address</dt><dd><a href={result.finalUrl} target="_blank" rel="noreferrer">{result.finalUrl}</a></dd></div>
                <div><dt>Downloaded</dt><dd>{(result.bytesRead / 1024).toFixed(1)} KB · {result.contentType}</dd></div>
              </dl>
              <AnalysisReportView analysis={result.analysis} />
              <div className="policy-results">
                <div className="policy-results-heading"><p className="eyebrow">DISCOVERED & EXTRACTED</p><span>ORIGINAL SOURCE TEXT</span></div>
                <PolicyReport label="Privacy policy" result={result.policies.privacy} />
                <PolicyReport label="Cookie policy" result={result.policies.cookie} />
              </div>
              <ObservationReport observation={result.observation} />
              <p className="phase-note">Policy disclosures and technical observations are separate. Rule-based findings may miss wording outside the included terminology.</p>
            </section>
          )}
        </div>
      </section>
      <section className="brand-promise" id="how-it-works">
        <div><span className="promise-number">01</span><h3>Declared</h3><p>Policy links and clauses, preserved from the source.</p></div>
        <div><span className="promise-number">02</span><h3>Observed</h3><p>Browser signals kept separate from policy statements.</p></div>
        <div><span className="promise-number">03</span><h3>Traceable</h3><p>Evidence before interpretation, always.</p></div>
      </section>
      <footer className="footer"><span>DG / DGUARD PRIVACY INTELLIGENCE</span><span>Independent reading. Original sources.</span><span>BUILT FOR CLARITY</span></footer>
    </main>
  );
}
