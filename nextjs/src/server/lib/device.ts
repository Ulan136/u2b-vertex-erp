// Pure user-agent → device-class helper (no imports) so it stays edge-safe and
// unit-testable. Used by the root redirect to pick a role's landing screen
// (director lands on the mobile cabinet from a phone, on the ERP from desktop).
export function isMobileUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Android|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile|Mobile Safari|\bMobi\b/i.test(ua);
}
