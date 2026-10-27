import { AuthService } from './auth.service';
describe('refresh security', () => {
  it.each(['deleted', 'suspended', 'deactivated'])('rejects %s accounts', async accountStatus => {
    const prisma = { customerRefreshToken: { findUnique: jest.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 60000), customer: { accountStatus } }), deleteMany: jest.fn() } };
    await expect(new AuthService(prisma as any, {} as any).refreshToken('test')).rejects.toThrow('Account is not active');
    expect(prisma.customerRefreshToken.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects a concurrently consumed token before signing another token', async () => {
    const prisma = { customerRefreshToken: { findUnique: jest.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 60000), customer: { accountStatus: 'active' } }), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(new AuthService(prisma as any, {} as any).refreshToken('test')).rejects.toThrow('already used');
  });
});
