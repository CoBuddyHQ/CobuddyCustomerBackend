import { ReviewsService } from './reviews.service';

describe('ReviewsService downstream sync retry', () => {
  it('records each successful sink independently and leaves failed sinks retryable', async () => {
    const review = {
      id: 'review-1',
      bookingId: 'booking-1',
      customerId: 'customer-1',
      companionId: 'companion-1',
      rating: 4,
      comment: 'Kind and punctual',
      tags: ['punctual'],
      punctuality: 4,
      communication: 5,
      behavior: 4,
      companionSyncedAt: null,
      adminSyncedAt: null,
      customer: { name: 'Asha Sharma' },
    };
    const prisma = {
      customerReview: {
        findMany: jest.fn().mockResolvedValue([review]),
        update: jest.fn().mockResolvedValue(review),
      },
    };
    const companionClient = {
      syncReviewToCompanion: jest.fn().mockResolvedValue({ success: true }),
      syncReviewToAdmin: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const service = new ReviewsService(prisma as any, companionClient as any);

    await service.retryPendingReviewSyncs();

    expect(companionClient.syncReviewToCompanion).toHaveBeenCalledWith('companion-1', expect.objectContaining({
      bookingId: 'booking-1',
      customerInitials: 'A.S.',
      rating: 4,
    }));
    expect(companionClient.syncReviewToAdmin).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: 'booking-1',
      byCustomerId: 'customer-1',
      toCompanionId: 'companion-1',
    }));
    expect(prisma.customerReview.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'review-1' },
      data: expect.objectContaining({ companionSyncedAt: expect.any(Date) }),
    }));
    expect(prisma.customerReview.update.mock.calls.some(([call]) =>
      call.data.adminSyncedAt !== undefined,
    )).toBe(false);
  });

  it('selects unsynced reviews whose last failed attempt is old enough to retry', async () => {
    const prisma = {
      customerReview: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReviewsService(prisma as any, {} as any);

    await service.retryPendingReviewSyncs();

    const where = prisma.customerReview.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0].OR[1].companionSyncAttemptedAt.lte).toBeInstanceOf(Date);
    expect(where.OR[1].OR[1].adminSyncAttemptedAt.lte).toBeInstanceOf(Date);
  });
});
