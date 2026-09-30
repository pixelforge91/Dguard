import assert from "node:assert/strict";
import test from "node:test";
import { extractTitle, fetchPublicHomepage, isPublicAddress, normalizeUrl } from "./scanner";

test("normalizes a bare hostname to HTTPS and strips fragments", () => {
  assert.equal(normalizeUrl("example.com/path#section").toString(), "https://example.com/path");
  assert.equal(normalizeUrl(new URL("https://example.com/path#section")).toString(), "https://example.com/path");
});

test("rejects unsupported protocols, credentials, and malformed inputs", () => {
  for (const value of ["file:///etc/passwd", "ftp://example.com", "https://user:pass@example.com", "not a url"]) assert.throws(() => normalizeUrl(value));
});

test("allows public addresses and rejects restricted address ranges", () => {
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "fe80::1"]) assert.equal(isPublicAddress(address), false, `${address} must not be public`);
});

test("extracts and decodes a homepage title without markup", () => {
  assert.equal(extractTitle("<html><title>Privacy &amp; Trust</title></html>"), "Privacy & Trust");
  assert.equal(extractTitle("<html><body>No title</body></html>"), null);
});

test("rejects private literal hosts before making a network request", async () => {
  for (const value of ["http://127.0.0.1", "http://10.0.0.1", "http://169.254.169.254", "http://[::1]"]) {
    await assert.rejects(fetchPublicHomepage(value), /not a public website/i);
  }
});