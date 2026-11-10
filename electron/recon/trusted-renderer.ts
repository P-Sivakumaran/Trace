export function trustedDocument(candidate: string, entry: string): boolean {
  try {
    const target = new URL(candidate); const expected = new URL(entry);
    return target.protocol === expected.protocol && target.host === expected.host && target.pathname === expected.pathname && target.search === expected.search;
  } catch { return false; }
}
