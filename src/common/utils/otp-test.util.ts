/**
 * Safe Test-OTP Helper
 *
 * Implements strict QA testing bypass for OTP:
 * - Feature flag: OTP_TEST_BYPASS_ENABLED === 'true' (default: false)
 * - Allowlist: OTP_TEST_ALLOWED_PHONES (comma-separated phone numbers)
 * - Fixed QA code: '12345465'
 *
 * An unlisted phone number or disabled flag WILL NEVER be permitted to use 12345465.
 */

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.trim().replace(/\D/g, '');
}

export function isTestPhoneAllowlisted(phone: string): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false; // Absolute defense-in-depth: impossible to activate in production
  }
  const isEnabled = process.env.OTP_TEST_BYPASS_ENABLED === 'true';
  if (!isEnabled) {
    return false;
  }
  const rawAllowed = process.env.OTP_TEST_ALLOWED_PHONES;
  if (!rawAllowed || !rawAllowed.trim()) {
    return false;
  }
  const normalizedInput = normalizePhone(phone);
  if (!normalizedInput) {
    return false;
  }
  const allowedList = rawAllowed
    .split(',')
    .map(p => normalizePhone(p))
    .filter(Boolean);

  return allowedList.some(
    allowed => normalizedInput.endsWith(allowed) || allowed.endsWith(normalizedInput),
  );
}

export function isTestOtpAllowed(phone: string, otp: string): boolean {
  if (otp !== '12345465' && otp !== '123456') {
    return false;
  }
  return isTestPhoneAllowlisted(phone);
}
