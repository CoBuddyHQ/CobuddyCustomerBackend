/**
 * Safe Test-OTP Helper
 *
 * Implements strict QA testing bypass for OTP:
 * - Feature flag: OTP_TEST_BYPASS_ENABLED === 'true' (default: false)
 * - Allowlist: OTP_TEST_ALLOWED_PHONES (comma-separated phone numbers)
 * - Fixed QA code matches the six-digit mobile OTP contract.
 *
 * An unlisted phone number or disabled flag cannot use a reserved QA code.
 */

// Reserved for opt-in, allowlisted QA sessions; never issue these via an SMS provider.
export const QA_TEST_OTP = '123454';
const RETIRED_QA_TEST_OTP = '12345465';

export function isReservedTestOtp(otp: string): boolean {
  return otp === QA_TEST_OTP || otp === RETIRED_QA_TEST_OTP;
}

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

  const phoneVariants = new Set([normalizedInput]);
  if (normalizedInput.length === 10) {
    phoneVariants.add(`91${normalizedInput}`);
  } else if (normalizedInput.length === 12 && normalizedInput.startsWith('91')) {
    phoneVariants.add(normalizedInput.slice(2));
  }

  return allowedList.some(allowed => phoneVariants.has(allowed));
}

export function isTestOtpAllowed(phone: string, otp: string): boolean {
  if (otp !== QA_TEST_OTP) {
    return false;
  }
  return isTestPhoneAllowlisted(phone);
}
