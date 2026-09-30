import assert from "node:assert/strict";
import test from "node:test";
import { discoverPolicies, extractPolicy } from "./policies";

test("discovers privacy and cookie pages from actual footer links", () => {
  const html = `<html><body><footer>
    <a href="/legal/data-protection">Your Privacy</a>
    <a href="/consent">Cookie Settings</a>
  </footer></body></html>`;
  const policies = discoverPolicies(html, "https://sample.example/home");

  assert.equal(policies.privacy?.url, "https://sample.example/legal/data-protection");
  assert.ok(policies.privacy && policies.privacy.confidence >= 0.4);
  assert.equal(policies.cookie?.url, "https://sample.example/consent");
  assert.ok(policies.cookie && policies.cookie.confidence >= 0.4);
});

test("returns null instead of guessing a policy URL", () => {
  const policies = discoverPolicies('<html><body><a href="/about">About us</a></body></html>', "https://sample.example");
  assert.deepEqual(policies, { privacy: null, cookie: null });
});

test("resolves and scores a policy link hosted on a different public origin", () => {
  const policies = discoverPolicies('<a title="Privacy Notice" href="https://legal.example/policy">More</a>', "https://sample.example");
  assert.equal(policies.privacy?.url, "https://legal.example/policy");
  assert.ok(policies.privacy!.confidence >= 0.4);
});

test("extracts headings, numbered references, lists, tables, and clean text", () => {
  const html = `<html><head><title>Privacy | Sample</title></head><body>
    <nav>Navigation to remove</nav><main><h1>Privacy policy</h1>
      <p>We collect information to provide the service.</p>
      <h2>5 Information sharing</h2><p>We share information with service providers.</p>
      <h3>5.1(a) Service providers</h3><ul><li>Hosting vendors</li><li>Payment processors</li></ul>
      <table><tr><th>Data</th><th>Purpose</th></tr><tr><td>Email</td><td>Account access</td></tr></table>
      <script>secret script text</script><div class="cookie-banner">Cookie popup</div>
    </main><footer>Site footer noise</footer></body></html>`;
  const policy = extractPolicy(html, "https://sample.example/privacy");

  assert.equal(policy.title, "Privacy | Sample");
  assert.equal(policy.sourceUrl, "https://sample.example/privacy");
  assert.equal(policy.sections[1].reference, "5");
  assert.equal(policy.sections[2].reference, "5.1(a)");
  assert.ok(policy.sections.some((section) => section.blocks.some((block) => block.type === "list")));
  assert.ok(policy.sections.some((section) => section.blocks.some((block) => block.type === "table")));
  assert.match(policy.text, /Hosting vendors/);
  assert.doesNotMatch(policy.text, /Navigation to remove|secret script text|Cookie popup|Site footer noise/);
  assert.ok(policy.chunks.every((chunk, index) => chunk.index === index));
});

test("splits long content into bounded section-aware chunks", () => {
  const text = "A privacy sentence with enough information. ".repeat(400);
  const policy = extractPolicy(`<main><h2>7 Retention</h2><p>${text}</p></main>`, "https://sample.example/privacy");
  assert.ok(policy.chunks.length > 1);
  assert.ok(policy.chunks.every((chunk) => chunk.text.length <= 6000));
  assert.ok(policy.chunks.every((chunk) => chunk.section === "7"));
});