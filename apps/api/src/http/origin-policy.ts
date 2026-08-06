export function isAllowedRequestOrigin(
  value: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (value === undefined) return true;
  if (value.length === 0 || value.length > 256) return false;
  try {
    const parsed = new URL(value);
    if (
      parsed.origin !== value ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return false;
    }
    return allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}
