import { KycService } from './kyc.service';
describe('private KYC ownership', () => {
  const filename = '12345678-1234-1234-1234-123456789abc.png';
  it('allows only a file referenced by the requesting owner', async () => {
    const prisma = { customerKyc: { findUnique: jest.fn().mockResolvedValue({ frontDocUrl: `/api/v1/kyc/files/documents/${filename}` }) } };
    await expect(new KycService(prisma as any).authorizeFile('owner', 'documents', filename)).resolves.toBeUndefined();
    expect(prisma.customerKyc.findUnique).toHaveBeenCalledWith({ where: { customerId: 'owner' } });
  });
  it('rejects another account without matching evidence', async () => {
    const prisma = { customerKyc: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new KycService(prisma as any).authorizeFile('other', 'documents', filename)).rejects.toThrow('Document not found');
  });
  it('rejects path traversal before database access', async () => {
    await expect(new KycService({} as any).authorizeFile('owner', '..', filename)).rejects.toThrow('Document not found');
  });
});
