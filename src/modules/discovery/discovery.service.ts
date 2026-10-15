import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanionFilterDto } from './dto/discovery.dto';
import { CompanionClientService } from '../companion-client/companion-client.service';

export { CompanionFilterDto };

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private prisma: PrismaService,
    private companionClient: CompanionClientService,
  ) {}

  async getCampaigns() {
    return this.companionClient.getCampaigns();
  }

  private async fetchCompanionsFromService(query?: Record<string, any>) {
    return this.companionClient.getCompanions(query);
  }

  private async fetchCompanionDetailFromService(companionId: string) {
    return this.companionClient.getCompanionById(companionId);
  }

  async getCompanions(filter: CompanionFilterDto) {
    const data = await this.fetchCompanionsFromService({
      city: filter.city,
      category: filter.category,
      gender: filter.gender,
      search: filter.search,
      page: filter.page,
      limit: filter.limit,
    });
    return data;
  }

  async getFeaturedCompanions() {
    const data = await this.fetchCompanionsFromService({ limit: 10 });
    return (data.companions || []).filter((c: any) => (c.rating ?? 0) >= 4.8);
  }

  async getCompanionDetail(companionId: string) {
    return this.fetchCompanionDetailFromService(companionId);
  }

  async getFavorites(customerId: string) {
    const favorites = await this.prisma.customerFavorite.findMany({
      where: { customerId },
    });
    if (!favorites.length) return [];
    const profiles = await Promise.all(
      favorites.map((f) => this.fetchCompanionDetailFromService(f.companionId).catch(() => null))
    );
    return profiles.filter(Boolean);
  }

  async addFavorite(customerId: string, companionId: string) {
    await this.prisma.customerFavorite.upsert({
      where: { customerId_companionId: { customerId, companionId } },
      create: { customerId, companionId },
      update: {},
    });
    return { message: 'Added to favorites' };
  }

  async removeFavorite(customerId: string, companionId: string) {
    await this.prisma.customerFavorite.deleteMany({
      where: { customerId, companionId },
    });
    return { message: 'Removed from favorites' };
  }

  getInterests() {
    return [
      { id: 'int_1', name: 'Coffee & Conversation', icon: 'coffee', category: 'social' },
      { id: 'int_2', name: 'Fine Dining & Food', icon: 'silverware-fork-knife', category: 'dining' },
      { id: 'int_3', name: 'Shopping & Styling', icon: 'shopping', category: 'lifestyle' },
      { id: 'int_4', name: 'Movies & Cinema', icon: 'filmstrip', category: 'entertainment' },
      { id: 'int_5', name: 'Art & Museums', icon: 'palette', category: 'culture' },
      { id: 'int_6', name: 'Fitness & Workout', icon: 'dumbbell', category: 'health' },
      { id: 'int_7', name: 'City Guide & Walk', icon: 'map-marker-path', category: 'travel' },
      { id: 'int_8', name: 'Nightlife & Events', icon: 'glass-cocktail', category: 'nightlife' },
      { id: 'int_9', name: 'Networking & Biz', icon: 'briefcase', category: 'career' },
      { id: 'int_10', name: 'Gaming & Anime', icon: 'gamepad-variant', category: 'entertainment' },
    ];
  }

  getActivities() {
    return [
      { id: 'a1', titleKey: 'activity.a1.title', defaultTitle: 'Coffee Meetup', icon: 'coffee-outline', price: '₹500/hr', descKey: 'activity.a1.desc', defaultDesc: 'A relaxed conversation over a cup of coffee.' },
      { id: 'a2', titleKey: 'activity.a2.title', defaultTitle: 'Movie Companion', icon: 'popcorn', price: '₹800/hr', descKey: 'activity.a2.desc', defaultDesc: 'Watch a movie together and discuss it later.' },
      { id: 'a3', titleKey: 'activity.a3.title', defaultTitle: 'City Tour', icon: 'city-variant-outline', price: '₹1000/hr', descKey: 'activity.a3.desc', defaultDesc: 'Explore the best local spots and hidden gems.' },
      { id: 'a4', titleKey: 'activity.a4.title', defaultTitle: 'Gaming Session', icon: 'controller-classic-outline', price: '₹600/hr', descKey: 'activity.a4.desc', defaultDesc: 'Arcade, bowling, or console gaming.' },
    ];
  }

  async getHomeData(customerId?: string) {
    const startTime = Date.now();
    let unreadNotificationCount = 0;
    let upcomingBookingCount = 0;
    let activeBooking = null;
    let customerProfile = null;

    if (customerId) {
      const [unreadCountRes, upcomingCountRes, profileRes, activeBookingRes] = await Promise.all([
        this.prisma.customerNotification.count({
          where: { customerId, isRead: false },
        }).catch(() => 0),

        this.prisma.customerBooking.count({
          where: {
            customerId,
            status: { in: ['pending', 'accepted', 'confirmed', 'in_progress'] },
          },
        }).catch(() => 0),

        this.prisma.customer.findUnique({
          where: { id: customerId },
          select: {
            id: true,
            name: true,
            photoUrl: true,
            city: true,
            gender: true,
            interests: true,
          },
        }).catch(() => null),

        this.prisma.customerBooking.findFirst({
          where: {
            customerId,
            status: { in: ['accepted', 'confirmed', 'in_progress'] },
          },
          orderBy: { date: 'asc' },
        }).catch(() => null),
      ]);

      unreadNotificationCount = unreadCountRes;
      upcomingBookingCount = upcomingCountRes;
      customerProfile = profileRes;
      activeBooking = activeBookingRes;
    }

    const categories = [
      { id: 'coffee', title: 'Coffee Meetups', icon: 'coffee', color: '#D4AF37' },
      { id: 'movie', title: 'Movie Buffs', icon: 'movie', color: '#E11D48' },
      { id: 'city', title: 'City Walk', icon: 'map-marker', color: '#10B981' },
      { id: 'study', title: 'Study Buddy', icon: 'book', color: '#3B82F6' },
      { id: 'shopping', title: 'Shopping & Lifestyle', icon: 'shopping', color: '#8B5CF6' },
    ];

    const [featuredCompanions, campaignsRes] = await Promise.all([
      this.getFeaturedCompanions(),
      this.getCampaigns().catch(() => ({ success: true, campaigns: [] })),
    ]);

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `[Customer Home API] GET /api/v1/discovery/home | customerId: ${customerId || 'guest'} | categories: ${categories.length} | featuredCompanions: ${featuredCompanions.length} | campaigns: ${campaignsRes.campaigns.length} | unreadNotifs: ${unreadNotificationCount} | upcomingBookings: ${upcomingBookingCount} | duration: ${durationMs}ms`
    );

    return {
      success: true,
      data: {
        profile: customerProfile,
        categories,
        featuredCompanions,
        campaigns: campaignsRes.campaigns || [],
        quickAccess: {
          notificationCount: unreadNotificationCount,
          bookingCount: upcomingBookingCount,
        },
        activeBooking,
      },
    };
  }
}
