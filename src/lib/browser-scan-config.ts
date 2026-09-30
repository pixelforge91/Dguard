export function shouldRunBrowserScan(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (environment.DGUARD_ENABLE_BROWSER_SCAN === "1" || environment.DGUARD_ENABLE_BROWSER_SCAN === "true") return true;
  return environment.VERCEL !== "1";
}