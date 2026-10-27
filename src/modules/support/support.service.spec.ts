import { SupportService } from './support.service';

describe('SupportService FAQ claims', () => {
  it('does not promise checkout, escrow, provider refunds, emergency dispatch, or identity review', () => {
    const service = new SupportService({} as never);
    const faqs = service.getFaqs() as Array<{ id: string; answer: string }>;
    const copy = faqs.map((faq) => faq.answer.toLowerCase()).join(' ');

    expect(copy).toContain('checkout is unavailable');
    expect(copy).toContain('refund transfers are not configured');
    expect(copy).toContain('does not notify trusted contacts');
    expect(copy).toContain('do not treat a badge as a guarantee');
    expect(copy).not.toContain('24/7 internal security team');
    expect(copy).not.toContain('fully refunded');
    expect(copy).not.toContain('bank-level aes-256');
  });
});
