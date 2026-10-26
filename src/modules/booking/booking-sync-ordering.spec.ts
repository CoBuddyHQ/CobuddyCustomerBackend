import { BookingService } from './booking.service';
describe('booking sync ordering', () => {
  it.each([['completed', 'in_progress'], ['cancelled', 'accepted'], ['in_progress', 'accepted']])(
    'does not roll %s backwards to %s', async (status, incoming) => {
      const booking = { id: 'booking', status, sessions: [] };
      const prisma = { customerBooking: { findUnique: jest.fn().mockResolvedValue(booking) }, $transaction: jest.fn() };
      const service = new BookingService(prisma as any, {} as any);
      jest.spyOn(service as any, 'buildBookingResponse').mockReturnValue(booking);
      await expect(service.handleInternalStatusUpdate('booking', { status: incoming } as any)).resolves.toMatchObject({ ignored: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('retries the Admin projection without repeating a completed transition', async () => {
    const booking = { id: 'booking', status: 'completed', sessions: [] };
    const prisma = { customerBooking: { findUnique: jest.fn().mockResolvedValue(booking) }, $transaction: jest.fn() };
    const client = { syncBookingToAdmin: jest.fn().mockResolvedValue({ success: true }) };
    const service = new BookingService(prisma as any, client as any);
    jest.spyOn(service as any, 'buildBookingResponse').mockReturnValue(booking);
    await expect(service.handleInternalStatusUpdate('booking', { status: 'completed' } as any)).resolves.toMatchObject({ duplicate: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(client.syncBookingToAdmin).toHaveBeenCalledTimes(1);
  });
});
