import {
  QA_TEST_OTP,
  isReservedTestOtp,
  isTestOtpAllowed,
  isTestPhoneAllowlisted,
  normalizePhone,
} from '../../common/utils/otp-test.util';

describe('Auth Security & QA Test OTP Bypass Safeguards', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('normalizePhone', () => {
    it('normalizes formatted phone numbers by stripping non-digits', () => {
      expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
      expect(normalizePhone('  9876543210  ')).toBe('9876543210');
      expect(normalizePhone('')).toBe('');
    });
  });

  describe('isTestPhoneAllowlisted', () => {
    it('returns false when OTP_TEST_BYPASS_ENABLED is not set or false', () => {
      process.env.OTP_TEST_BYPASS_ENABLED = 'false';
      process.env.OTP_TEST_ALLOWED_PHONES = '9876543210';
      expect(isTestPhoneAllowlisted('9876543210')).toBe(false);
    });

    it('returns false when OTP_TEST_ALLOWED_PHONES is empty even if flag is true', () => {
      process.env.OTP_TEST_BYPASS_ENABLED = 'true';
      delete process.env.OTP_TEST_ALLOWED_PHONES;
      expect(isTestPhoneAllowlisted('9876543210')).toBe(false);
    });

    it('returns true only when phone is in OTP_TEST_ALLOWED_PHONES and flag is true', () => {
      process.env.OTP_TEST_BYPASS_ENABLED = 'true';
      process.env.OTP_TEST_ALLOWED_PHONES = '9876543210,919999988888';

      expect(isTestPhoneAllowlisted('9876543210')).toBe(true);
      expect(isTestPhoneAllowlisted('+91 98765 43210')).toBe(true);
      expect(isTestPhoneAllowlisted('9999988888')).toBe(true);
      expect(isTestPhoneAllowlisted('9111111111')).toBe(false); // Unlisted number
    });

    it('does not treat another country code as the allowlisted phone', () => {
      process.env.OTP_TEST_BYPASS_ENABLED = 'true';
      process.env.OTP_TEST_ALLOWED_PHONES = '9876543210';

      expect(isTestPhoneAllowlisted('+1 98765 43210')).toBe(false);
    });

    it('always disables the QA allowlist in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.OTP_TEST_BYPASS_ENABLED = 'true';
      process.env.OTP_TEST_ALLOWED_PHONES = '9876543210';

      expect(isTestPhoneAllowlisted('9876543210')).toBe(false);
    });
  });

  it('uses exactly six numeric digits for the mobile OTP inputs', () => {
    expect(/^\d{6}$/.test(QA_TEST_OTP)).toBe(true);
    expect(isReservedTestOtp(QA_TEST_OTP)).toBe(true);
    expect(isReservedTestOtp('9'.repeat(6))).toBe(false);
  });

  describe('isTestOtpAllowed', () => {
    beforeEach(() => {
      process.env.OTP_TEST_BYPASS_ENABLED = 'true';
      process.env.OTP_TEST_ALLOWED_PHONES = '9876543210';
    });

    it('accepts the exact QA code for allowlisted phone number', () => {
      expect(isTestOtpAllowed('9876543210', QA_TEST_OTP)).toBe(true);
    });

    it('rejects the exact QA code for unlisted phone number', () => {
      expect(isTestOtpAllowed('9112345678', QA_TEST_OTP)).toBe(false);
    });

    it('rejects any other OTP even for an allowlisted phone number', () => {
      expect(isTestOtpAllowed('9876543210', '000000')).toBe(false);
      expect(isTestOtpAllowed('9876543210', '123456')).toBe(false); // Old legacy bypass is rejected
      expect(isTestOtpAllowed('9876543210', '1234546')).toBe(false);
    });

    it('rejects the QA code if flag is disabled', () => {
      process.env.OTP_TEST_BYPASS_ENABLED = 'false';
      expect(isTestOtpAllowed('9876543210', QA_TEST_OTP)).toBe(false);
    });

    it('rejects the QA code in production even with the flag and allowlist enabled', () => {
      process.env.NODE_ENV = 'production';
      expect(isTestOtpAllowed('9876543210', QA_TEST_OTP)).toBe(false);
    });
  });
});
