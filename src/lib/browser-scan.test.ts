import assert from "node:assert/strict";
import test from "node:test";
import { classifyObservedCookie, classifyObservedDomain, cookieDomainIsRelated } from "./browser-scan";
import { shouldRunBrowserScan } from "./browser-scan-config";

test("classifies observed analytics and advertising hostnames without legal conclusions", () => {
  assert.deepEqual(classifyObservedDomain("www.google-analytics.com"), ["analytics"]);
  assert.deepEqual(classifyObservedDomain("googleads.g.doubleclick.net"), ["advertising or social measurement"]);
  assert.deepEqual(classifyObservedDomain("ordinary.example"), []);
});

test("relates cookies to the observed first-party host", () => {
  assert.equal(cookieDomainIsRelated("shop.example.com", ".example.com"), true);
  assert.equal(cookieDomainIsRelated("unrelated.example.net", ".example.com"), false);
});

test("uses cautious heuristic cookie labels and preserves unknowns", () => {
  assert.equal(classifyObservedCookie("sessionid"), "likely essential");
  assert.equal(classifyObservedCookie("_ga_ABC123"), "possible analytics");
  assert.equal(classifyObservedCookie("_fbp"), "possible advertising");
  assert.equal(classifyObservedCookie("opaque_cookie"), "unknown");
});

test("disables Playwright on Vercel unless browser runtime is explicitly enabled", () => {
  assert.equal(shouldRunBrowserScan({ VERCEL: "1" }), false);
  assert.equal(shouldRunBrowserScan({ VERCEL: "1", DGUARD_ENABLE_BROWSER_SCAN: "1" }), true);
  assert.equal(shouldRunBrowserScan({}), true);
});
