import assert from "node:assert/strict";
import test from "node:test";
import { analyzePolicies } from "./analysis";
import type { ExtractedPolicy } from "./policies";

const samplePolicy: ExtractedPolicy = {
  sourceUrl: "https://sample.example/privacy",
  title: "Privacy Notice",
  text: "",
  truncated: false,
  chunks: [],
  sections: [
    {
      reference: "2",
      heading: "Information we collect",
      text: "We collect your name, email address, IP address, device information, and browsing activity when you use the service.",
      blocks: [{ type: "paragraph", text: "We collect your name, email address, IP address, device information, and browsing activity when you use the service." }],
    },
    {
      reference: "3",
      heading: "How we use information",
      text: "We use information for analytics, account management, and advertising. Google Analytics helps us understand service usage.",
      blocks: [{ type: "paragraph", text: "We use information for analytics, account management, and advertising. Google Analytics helps us understand service usage." }],
    },
    {
      reference: "4",
      heading: "Sharing and retention",
      text: "We share information with service providers and payment processors. We retain account information for 24 months after account closure.",
      blocks: [{ type: "paragraph", text: "We share information with service providers and payment processors. We retain account information for 24 months after account closure." }],
    },
    {
      reference: "5",
      heading: "Your rights and cookies",
      text: "You may request access to your information and opt out of targeted advertising. We use cookies and local storage to remember settings.",
      blocks: [{ type: "paragraph", text: "You may request access to your information and opt out of targeted advertising. We use cookies and local storage to remember settings." }],
    },
  ],
};

test("produces deterministic ontology findings with exact source evidence", () => {
  const result = analyzePolicies([samplePolicy]);
  const email = result.dataCollected.find((finding) => finding.subcategory === "email");
  const access = result.userRights.find((finding) => finding.subcategory === "access");
  assert.equal(email?.mode, "explicit");
  assert.equal(email?.sourceUrl, samplePolicy.sourceUrl);
  assert.equal(email?.section, "2 Information we collect");
  assert.match(email?.evidence ?? "", /email address/);
  assert.equal(access?.mode, "explicit");
});

test("scores only disclosure dimensions and remains within 0 to 100", () => {
  const result = analyzePolicies([samplePolicy]);
  assert.ok(result.disclosureProfile.score >= 0 && result.disclosureProfile.score <= 100);
  assert.equal(result.disclosureProfile.label, "disclosure profile, not a trust or legal score");
  assert.ok(result.disclosureProfile.dimensions.some((dimension) => dimension.key === "retentionSpecificity" && dimension.score === 100));
  assert.match(result.disclosureProfile.methodology, /do not measure actual practices/);
});

test("returns deterministic template summary and not-found-in-text categories", () => {
  const result = analyzePolicies([samplePolicy]);
  assert.match(result.summary, /explicitly mentions/);
  assert.ok(result.notFoundInText.some((group) => group.category === "data collected" && group.items.includes("health information")));
  assert.equal(result.method, "deterministic_rules_v1");
});

test("ranks important source clauses and extracts known entities heuristically", () => {
  const result = analyzePolicies([samplePolicy]);
  assert.ok(result.importantClauses.length > 0);
  assert.ok(result.importantClauses.every((clause) => clause.sourceUrl === samplePolicy.sourceUrl && clause.relevance >= 0));
  assert.ok(result.entities.some((entity) => entity.name === "Google Analytics"));
});

test("does not report explicitly negated collection statements as collection findings", () => {
  const policy = {
    ...samplePolicy,
    sections: [{
      reference: "2",
      heading: "Information collection",
      text: "We do not collect your email address or precise location. We may collect your name when you create an account.",
      blocks: [{ type: "paragraph" as const, text: "We do not collect your email address or precise location. We may collect your name when you create an account." }],
    }],
  };
  const result = analyzePolicies([policy]);
  assert.equal(result.dataCollected.some((finding) => finding.subcategory === "email"), false);
  assert.equal(result.dataCollected.some((finding) => finding.subcategory === "name"), true);
});
