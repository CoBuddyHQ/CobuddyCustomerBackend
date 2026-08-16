import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanionFilterDto } from './dto/discovery.dto';

export { CompanionFilterDto };

@Injectable()
export class DiscoveryService {
  constructor(private prisma: PrismaService) {}

  // Fallback mock dataset for initial seed / offline query compatibility if companion tables are separate
  private defaultCompanions = [
    {
      id: 'c4',
      name: 'Natasha',
      initials: 'N',
      title: 'Chill hangout & cafe conversations',
      bio: 'Friendly companion who loves discovering quirky coffee shops, books, and great conversations.',
      activities: ['Cafe Hopping', 'Coffee', 'Conversation'],
      trustScore: 95,
      rating: 4.9,
      reviewsCount: 60,
      sessionsCount: 140,
      rate: 350,
      formattedRate: '₹350 /hr',
      distance: '2.0 km away',
      isOnline: true,
      category: 'coffee',
      gender: 'Female',
      city: 'Mumbai',
      photos: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800'],
      languages: ['English', 'Hindi'],
      hobbies: ['Cafe Hopping', 'Coffee', 'Podcasts'],
      rules: ['Public places only', 'No smoking'],
      verifications: ['ID Verified', 'Phone Verified'],
    },
    {
      id: 'c5',
      name: 'Sophia Patel',
      initials: 'SP',
      title: 'Film buff & entertainment companion',
      bio: 'Cinema lover, festival goer and entertainment buff. Let us watch a great film and discuss directors cuts!',
      activities: ['Movies', 'Entertainment', 'Networking'],
      trustScore: 99,
      rating: 4.7,
      reviewsCount: 210,
      sessionsCount: 512,
      rate: 600,
      formattedRate: '₹600 /hr',
      distance: '1.2 km away',
      isOnline: true,
      category: 'movie',
      gender: 'Female',
      city: 'Mumbai',
      photos: ['https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=800'],
      languages: ['English', 'Hindi', 'Gujarati'],
      hobbies: ['Cinema', 'Film Making', 'Music'],
      rules: ['Public places only'],
      verifications: ['ID Verified', 'Background Checked', 'Phone Verified'],
    },
    {
      id: 'c1',
      name: 'Elena Vasquez',
      initials: 'EV',
      title: 'City guide & local experiences expert',
      bio: "Hi! I love exploring new cafes in the city and talking about art, literature, and movies. Let's hang out in a nice public spot and have a great conversation!",
      activities: ['Fine Dining', 'Art & Culture', 'Networking'],
      trustScore: 98,
      rating: 4.97,
      reviewsCount: 124,
      sessionsCount: 312,
      rate: 500,
      formattedRate: '₹500 /hr',
      distance: '2.5 km away',
      isOnline: true,
      category: 'coffee',
      gender: 'Female',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English (Fluent)', 'Spanish (Basic)'],
      hobbies: ['Photography', 'Anime', 'Reading'],
      rules: ['Public places only', 'No smoking during sessions', 'Please book 24 hours in advance'],
      verifications: ['ID Verified', 'Phone Verified', 'Background Checked'],
    },
    {
      id: 'c2',
      name: 'Aisha Sharma',
      initials: 'AS',
      title: 'Shopping & lifestyle companion',
      bio: 'Fashion lover, shopping enthusiast and great listener.',
      activities: ['Shopping', 'Lifestyle', 'Coffee'],
      trustScore: 97,
      rating: 5.0,
      reviewsCount: 76,
      sessionsCount: 150,
      rate: 400,
      formattedRate: '₹400 /hr',
      distance: '3.0 km away',
      isOnline: true,
      category: 'shopping',
      gender: 'Female',
      city: 'Delhi',
      photos: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800'],
      languages: ['English', 'Hindi'],
      hobbies: ['Shopping', 'Fashion', 'Cafe Hopping'],
      rules: ['Public places only'],
      verifications: ['ID Verified', 'Phone Verified'],
    },
    {
      id: 'c3',
      name: 'Marcus Chen',
      initials: 'MC',
      title: 'Art historian & cultural explorer',
      bio: 'Lover of art history, architecture and good coffee.',
      activities: ['Art & Culture', 'Architecture', 'Wellness'],
      trustScore: 96,
      rating: 4.8,
      reviewsCount: 89,
      sessionsCount: 205,
      rate: 450,
      formattedRate: '₹450 /hr',
      distance: '4.0 km away',
      isOnline: true,
      category: 'study',
      gender: 'Male',
      city: 'Mumbai',
      photos: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800'],
      languages: ['English', 'Mandarin'],
      hobbies: ['Museums', 'History', 'Cycling'],
      rules: ['Public places only'],
      verifications: ['ID Verified', 'Background Checked'],
    },
    {
      id: 'c6',
      name: 'Aarav Mehta',
      initials: 'AM',
      title: 'Study partner & coding mentor',
      bio: 'Tech enthusiast and study buddy. Great for focused co-working and tech discussions.',
      activities: ['Study Buddy', 'Technology', 'Networking'],
      trustScore: 98,
      rating: 4.92,
      reviewsCount: 95,
      sessionsCount: 180,
      rate: 450,
      formattedRate: '₹450 /hr',
      distance: '3.5 km away',
      isOnline: true,
      category: 'study',
      gender: 'Male',
      city: 'Bangalore',
      photos: ['https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=800'],
      languages: ['English', 'Hindi'],
      hobbies: ['Programming', 'Chess', 'Reading'],
      rules: ['Public places only', 'Focus hours'],
      verifications: ['ID Verified', 'Phone Verified'],
    },
  ];

  async getCompanions(filter: CompanionFilterDto) {
    let result = [...this.defaultCompanions];

    if (filter.category && filter.category.trim()) {
      const cat = filter.category.toLowerCase().trim();
      result = result.filter(c => 
        c.category.toLowerCase().includes(cat) || 
        c.activities.some(a => a.toLowerCase().includes(cat)) ||
        (cat.includes('coffee') && (c.category === 'coffee' || c.activities.some(a => a.toLowerCase().includes('coffee')))) ||
        (cat.includes('movie') && (c.category === 'movie' || c.activities.some(a => a.toLowerCase().includes('movie')))) ||
        (cat.includes('study') && (c.category === 'study' || c.activities.some(a => a.toLowerCase().includes('study')))) ||
        (cat.includes('city') && (c.category === 'city' || c.category === 'coffee' || c.activities.some(a => a.toLowerCase().includes('city') || a.toLowerCase().includes('walk') || a.toLowerCase().includes('culture'))))
      );
    }
    if (filter.gender && filter.gender.toLowerCase() !== 'any') {
      const gen = filter.gender.toLowerCase().trim();
      result = result.filter(c => c.gender.toLowerCase() === gen);
    }
    if (filter.city && filter.city.trim()) {
      const cit = filter.city.toLowerCase().trim();
      result = result.filter(c => c.city.toLowerCase().includes(cit));
    }
    if (filter.search && filter.search.trim()) {
      const q = filter.search.toLowerCase().trim();
      result = result.filter(
        c => c.name.toLowerCase().includes(q) || 
             c.title.toLowerCase().includes(q) || 
             c.city.toLowerCase().includes(q) ||
             c.category.toLowerCase().includes(q) ||
             c.activities.some(a => a.toLowerCase().includes(q)) ||
             c.languages.some(l => l.toLowerCase().includes(q)) ||
             c.hobbies.some(h => h.toLowerCase().includes(q))
      );
    }
    if (filter.isOnline !== undefined) {
      result = result.filter(c => c.isOnline === filter.isOnline);
    }
    if (filter.maxPrice !== undefined && filter.maxPrice !== null) {
      const maxP = Number(filter.maxPrice);
      if (!isNaN(maxP)) {
        result = result.filter(c => c.rate <= maxP);
      }
    }
    if (filter.minRating !== undefined && filter.minRating !== null) {
      const minR = Number(filter.minRating);
      if (!isNaN(minR)) {
        result = result.filter(c => (c.rating ?? 0) >= minR);
      }
    }
    if (filter.maxDistance !== undefined && filter.maxDistance !== null) {
      const maxD = Number(filter.maxDistance);
      if (!isNaN(maxD)) {
        result = result.filter(c => {
          const distNum = parseFloat(c.distance);
          return isNaN(distNum) || distNum <= maxD;
        });
      }
    }

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const startIndex = (page - 1) * limit;
    const paginated = result.slice(startIndex, startIndex + limit);

    return {
      companions: paginated,
      total: result.length,
      page,
      limit,
      totalPages: Math.ceil(result.length / limit),
    };
  }

  async getFeaturedCompanions() {
    return this.defaultCompanions.filter(c => c.rating >= 4.9);
  }

  async getCompanionDetail(companionId: string) {
    const companion = this.defaultCompanions.find(c => c.id === companionId) || this.defaultCompanions[0];
    if (!companion) throw new NotFoundException('Companion profile not found');
    return companion;
  }

  async getFavorites(customerId: string) {
    const favorites = await this.prisma.customerFavorite.findMany({
      where: { customerId },
    });
    const ids = favorites.map(f => f.companionId);
    return this.defaultCompanions.filter(c => ids.includes(c.id));
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
}
