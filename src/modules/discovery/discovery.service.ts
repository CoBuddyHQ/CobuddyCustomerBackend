import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanionFilterDto } from './dto/discovery.dto';

export { CompanionFilterDto };

@Injectable()
export class DiscoveryService {
  constructor(private prisma: PrismaService) {}

  // Fallback rich companion dataset for discovery, featured, and profile view
  private defaultCompanions = [
    {
      id: 'c1',
      name: 'Elena Vasquez',
      age: 26,
      initials: 'EV',
      title: 'City guide & local experiences expert',
      bio: "Hi! I love exploring new cafes in the city and talking about art, literature, and movies. Let's hang out in a nice public spot and have a great conversation!",
      activities: ['Fine Dining', 'Art & Culture', 'Networking'],
      trustScore: 98,
      rating: 4.97,
      reviewsCount: 124,
      sessionsCount: 312,
      completedSessions: 312,
      rate: 500,
      formattedRate: '₹500 /hr',
      location: 'Mumbai, Maharashtra',
      distance: '2.5 km away',
      pronouns: 'She/Her',
      lastActive: 'Online now',
      responseTime: '< 1 hour',
      responseRate: '98%',
      memberSince: '2024',
      isOnline: true,
      category: 'coffee',
      gender: 'Female',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English (Fluent)', 'Spanish (Basic)', 'Hindi (Fluent)'],
      hobbies: ['Photography', 'Anime', 'Reading'],
      personality: ['Introvert', 'Good Listener', 'Foodie'],
      travelPreference: 'Willing to travel up to 10 km',
      pricing: [
        { activity: 'Coffee / Dining', price: '₹500/hr', icon: 'coffee-outline' },
        { activity: 'Movies / Events', price: '₹800/hr', icon: 'ticket-outline' },
        { activity: 'City Tour', price: '₹1000/hr', icon: 'city-variant-outline' },
      ],
      schedule: 'Available Today: 4 PM - 9 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only', 'No smoking during sessions', 'Please book 24 hours in advance'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Phone Verified', icon: 'phone-check-outline', color: '#10B981' },
        { label: 'Background Checked', icon: 'file-document-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.97,
        count: 124,
        categories: { punctuality: 5.0, communication: 4.8, behavior: 4.9 },
        items: [
          { id: 'r1', author: 'Alex', date: 'Oct 2026', activity: 'Coffee / Dining', text: 'Elena was a great listener and knew the best cafe in town. Really enjoyed our conversation.' },
          { id: 'r2', author: 'Jamie', date: 'Sep 2026', activity: 'City Tour', text: 'Super friendly and polite. Showed me some hidden gems in the city. Felt very safe and comfortable.' },
        ],
      },
    },
    {
      id: 'c2',
      name: 'Aisha Sharma',
      age: 24,
      initials: 'AS',
      title: 'Shopping & lifestyle companion',
      bio: 'Fashion lover, shopping enthusiast and great listener. Happy to accompany you for styling sessions, shopping sprees, or peaceful coffee breaks.',
      activities: ['Shopping', 'Lifestyle', 'Coffee'],
      trustScore: 97,
      rating: 5.0,
      reviewsCount: 76,
      sessionsCount: 150,
      completedSessions: 150,
      rate: 400,
      formattedRate: '₹400 /hr',
      location: 'Delhi, NCR',
      distance: '3.0 km away',
      pronouns: 'She/Her',
      lastActive: 'Online now',
      responseTime: '< 30 mins',
      responseRate: '99%',
      memberSince: '2024',
      isOnline: true,
      category: 'shopping',
      gender: 'Female',
      city: 'Delhi',
      photos: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English', 'Hindi', 'Punjabi'],
      hobbies: ['Shopping', 'Fashion', 'Cafe Hopping'],
      personality: ['Extrovert', 'Fashion Enthusiast', 'Empathetic'],
      travelPreference: 'Willing to travel up to 12 km',
      pricing: [
        { activity: 'Shopping & Styling', price: '₹400/hr', icon: 'shopping-outline' },
        { activity: 'Coffee / Dining', price: '₹450/hr', icon: 'coffee-outline' },
        { activity: 'Event Companion', price: '₹700/hr', icon: 'glass-cocktail' },
      ],
      schedule: 'Available Today: 2 PM - 8 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only', 'No substance use', 'Please book in advance'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Phone Verified', icon: 'phone-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 5.0,
        count: 76,
        categories: { punctuality: 5.0, communication: 5.0, behavior: 5.0 },
        items: [
          { id: 'r3', author: 'Rohan', date: 'Nov 2026', activity: 'Shopping', text: 'Aisha gave fantastic fashion advice and was very polite.' },
        ],
      },
    },
    {
      id: 'c3',
      name: 'Marcus Chen',
      age: 28,
      initials: 'MC',
      title: 'Art historian & cultural explorer',
      bio: 'Lover of art history, architecture and good coffee. Let us discover galleries, historic monuments, and quiet museum cafes together.',
      activities: ['Art & Culture', 'Architecture', 'Wellness'],
      trustScore: 96,
      rating: 4.8,
      reviewsCount: 89,
      sessionsCount: 205,
      completedSessions: 205,
      rate: 450,
      formattedRate: '₹450 /hr',
      location: 'Mumbai, Maharashtra',
      distance: '4.0 km away',
      pronouns: 'He/Him',
      lastActive: 'Online now',
      responseTime: '< 1 hour',
      responseRate: '94%',
      memberSince: '2023',
      isOnline: true,
      category: 'study',
      gender: 'Male',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English', 'Mandarin', 'Hindi'],
      hobbies: ['Museums', 'History', 'Cycling'],
      personality: ['Thoughtful', 'Knowledgeable', 'Calm'],
      travelPreference: 'Willing to travel up to 15 km',
      pricing: [
        { activity: 'Art & Culture Tour', price: '₹450/hr', icon: 'palette-outline' },
        { activity: 'Coffee & Discussion', price: '₹400/hr', icon: 'coffee-outline' },
        { activity: 'Architecture Walk', price: '₹800/hr', icon: 'city-variant-outline' },
      ],
      schedule: 'Available Tomorrow: 10 AM - 4 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only', 'Advance booking required'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Background Checked', icon: 'file-document-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.8,
        count: 89,
        categories: { punctuality: 4.8, communication: 4.9, behavior: 4.8 },
        items: [
          { id: 'r4', author: 'Priya', date: 'Aug 2026', activity: 'Art & Culture', text: 'Marcus knows so much about local museums. Loved every minute!' },
        ],
      },
    },
    {
      id: 'c4',
      name: 'Natasha',
      age: 23,
      initials: 'N',
      title: 'Chill hangout & cafe conversations',
      bio: 'Friendly companion who loves discovering quirky coffee shops, indie music, books, and great conversations in cosy cafes.',
      activities: ['Cafe Hopping', 'Coffee', 'Conversation'],
      trustScore: 95,
      rating: 4.9,
      reviewsCount: 60,
      sessionsCount: 140,
      completedSessions: 140,
      rate: 350,
      formattedRate: '₹350 /hr',
      location: 'Mumbai, Maharashtra',
      distance: '2.0 km away',
      pronouns: 'She/Her',
      lastActive: 'Online now',
      responseTime: '< 15 mins',
      responseRate: '97%',
      memberSince: '2024',
      isOnline: true,
      category: 'coffee',
      gender: 'Female',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English', 'Hindi'],
      hobbies: ['Cafe Hopping', 'Coffee', 'Podcasts'],
      personality: ['Easygoing', 'Friendly', 'Creative'],
      travelPreference: 'Willing to travel up to 8 km',
      pricing: [
        { activity: 'Coffee / Dining', price: '₹350/hr', icon: 'coffee-outline' },
        { activity: 'Casual Conversation', price: '₹350/hr', icon: 'chat-outline' },
      ],
      schedule: 'Available Today: 5 PM - 9 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only', 'No smoking'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Phone Verified', icon: 'phone-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.9,
        count: 60,
        categories: { punctuality: 4.9, communication: 5.0, behavior: 4.9 },
        items: [
          { id: 'r5', author: 'Vikram', date: 'Sep 2026', activity: 'Coffee', text: 'Natasha was super chill and great company.' },
        ],
      },
    },
    {
      id: 'c5',
      name: 'Sophia Patel',
      age: 27,
      initials: 'SP',
      title: 'Film buff & entertainment companion',
      bio: 'Cinema lover, festival goer and entertainment buff. Let us watch a great film, attend comedy nights, and discuss directors cuts!',
      activities: ['Movies', 'Entertainment', 'Networking'],
      trustScore: 99,
      rating: 4.7,
      reviewsCount: 210,
      sessionsCount: 512,
      completedSessions: 512,
      rate: 600,
      formattedRate: '₹600 /hr',
      location: 'Mumbai, Maharashtra',
      distance: '1.2 km away',
      pronouns: 'She/Her',
      lastActive: 'Online now',
      responseTime: '< 1 hour',
      responseRate: '96%',
      memberSince: '2023',
      isOnline: true,
      category: 'movie',
      gender: 'Female',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English', 'Hindi', 'Gujarati'],
      hobbies: ['Cinema', 'Film Making', 'Music'],
      personality: ['Vibrant', 'Articulate', 'Energetic'],
      travelPreference: 'Willing to travel up to 10 km',
      pricing: [
        { activity: 'Movies & Cinema', price: '₹600/hr', icon: 'ticket-outline' },
        { activity: 'Event Companion', price: '₹800/hr', icon: 'party-popper' },
      ],
      schedule: 'Available Today: 6 PM - 11 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Background Checked', icon: 'file-document-check-outline', color: '#10B981' },
        { label: 'Phone Verified', icon: 'phone-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.7,
        count: 210,
        categories: { punctuality: 4.8, communication: 4.7, behavior: 4.8 },
        items: [
          { id: 'r6', author: 'Neha', date: 'Jul 2026', activity: 'Movies', text: 'Sophia had great movie recommendations and made the festival memorable.' },
        ],
      },
    },
    {
      id: 'c6',
      name: 'Aarav Mehta',
      age: 25,
      initials: 'AM',
      title: 'Study partner & coding mentor',
      bio: 'Tech enthusiast and study buddy. Great for focused co-working, hackathon prep, and deep tech discussions over coffee.',
      activities: ['Study Buddy', 'Technology', 'Networking'],
      trustScore: 98,
      rating: 4.92,
      reviewsCount: 95,
      sessionsCount: 180,
      completedSessions: 180,
      rate: 450,
      formattedRate: '₹450 /hr',
      location: 'Bangalore, Karnataka',
      distance: '3.5 km away',
      pronouns: 'He/Him',
      lastActive: 'Online now',
      responseTime: '< 30 mins',
      responseRate: '98%',
      memberSince: '2024',
      isOnline: true,
      category: 'study',
      gender: 'Male',
      city: 'Bangalore',
      photos: [
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English', 'Hindi', 'Kannada'],
      hobbies: ['Programming', 'Chess', 'Reading'],
      personality: ['Analytical', 'Patient', 'Motivated'],
      travelPreference: 'Willing to travel up to 10 km',
      pricing: [
        { activity: 'Study / Co-Working', price: '₹450/hr', icon: 'laptop' },
        { activity: 'Coffee & Discussion', price: '₹400/hr', icon: 'coffee-outline' },
      ],
      schedule: 'Available Today: 10 AM - 6 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only', 'Focus hours'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Phone Verified', icon: 'phone-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.92,
        count: 95,
        categories: { punctuality: 5.0, communication: 4.9, behavior: 5.0 },
        items: [
          { id: 'r7', author: 'Karan', date: 'Aug 2026', activity: 'Study Buddy', text: 'Aarav is super helpful and very disciplined during co-working.' },
        ],
      },
    },
    {
      id: 'c7',
      name: 'Sneha Verma',
      age: 25,
      initials: 'SV',
      title: 'Local guide & city exploration expert',
      bio: 'Lifelong city resident with deep passion for hidden food joints, scenic viewpoints, and heritage trails.',
      activities: ['City Tour', 'Local Experiences', 'Coffee'],
      trustScore: 96,
      rating: 4.9,
      reviewsCount: 91,
      sessionsCount: 178,
      completedSessions: 178,
      rate: 450,
      formattedRate: '₹450 /hr',
      location: 'Mumbai, Maharashtra',
      distance: '2.8 km away',
      pronouns: 'She/Her',
      lastActive: 'Online now',
      responseTime: '< 45 mins',
      responseRate: '95%',
      memberSince: '2024',
      isOnline: true,
      category: 'coffee',
      gender: 'Female',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English', 'Hindi', 'Marathi'],
      hobbies: ['City Walk', 'Photography', 'Food Tasting'],
      personality: ['Enthusiastic', 'Friendly', 'Helpful'],
      travelPreference: 'Willing to travel up to 12 km',
      pricing: [
        { activity: 'City Tour', price: '₹450/hr', icon: 'city-variant-outline' },
        { activity: 'Coffee & Dining', price: '₹400/hr', icon: 'coffee-outline' },
      ],
      schedule: 'Available Today: 3 PM - 8 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Phone Verified', icon: 'phone-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.9,
        count: 91,
        categories: { punctuality: 4.9, communication: 4.9, behavior: 4.9 },
        items: [
          { id: 'r8', author: 'Ankit', date: 'Sep 2026', activity: 'City Tour', text: 'Sneha showed us the most authentic street food in South Mumbai!' },
        ],
      },
    },
    {
      id: 'f1',
      name: 'Elena Vasquez',
      age: 26,
      initials: 'EV',
      title: 'City guide & local experiences expert',
      bio: "Hi! I love exploring new cafes in the city and talking about art, literature, and movies. Let's hang out in a nice public spot and have a great conversation!",
      activities: ['Fine Dining', 'Art & Culture', 'Networking'],
      trustScore: 98,
      rating: 4.97,
      reviewsCount: 124,
      sessionsCount: 312,
      completedSessions: 312,
      rate: 500,
      formattedRate: '₹500 /hr',
      location: 'Mumbai, Maharashtra',
      distance: '2.5 km away',
      pronouns: 'She/Her',
      lastActive: 'Online now',
      responseTime: '< 1 hour',
      responseRate: '98%',
      memberSince: '2024',
      isOnline: true,
      category: 'coffee',
      gender: 'Female',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English (Fluent)', 'Spanish (Basic)', 'Hindi (Fluent)'],
      hobbies: ['Photography', 'Anime', 'Reading'],
      personality: ['Introvert', 'Good Listener', 'Foodie'],
      travelPreference: 'Willing to travel up to 10 km',
      pricing: [
        { activity: 'Coffee / Dining', price: '₹500/hr', icon: 'coffee-outline' },
        { activity: 'Movies / Events', price: '₹800/hr', icon: 'ticket-outline' },
        { activity: 'City Tour', price: '₹1000/hr', icon: 'city-variant-outline' },
      ],
      schedule: 'Available Today: 4 PM - 9 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only', 'No smoking during sessions', 'Please book 24 hours in advance'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Phone Verified', icon: 'phone-check-outline', color: '#10B981' },
        { label: 'Background Checked', icon: 'file-document-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.97,
        count: 124,
        categories: { punctuality: 5.0, communication: 4.8, behavior: 4.9 },
        items: [
          { id: 'r1', author: 'Alex', date: 'Oct 2026', activity: 'Coffee / Dining', text: 'Elena was a great listener and knew the best cafe in town. Really enjoyed our conversation.' },
          { id: 'r2', author: 'Jamie', date: 'Sep 2026', activity: 'City Tour', text: 'Super friendly and polite. Showed me some hidden gems in the city. Felt very safe and comfortable.' },
        ],
      },
    },
    {
      id: 'f2',
      name: 'Marcus Chen',
      age: 28,
      initials: 'MC',
      title: 'Art historian & cultural explorer',
      bio: 'Lover of art history, architecture and good coffee. Let us discover galleries, historic monuments, and quiet museum cafes together.',
      activities: ['Art & Culture', 'Architecture', 'Wellness'],
      trustScore: 96,
      rating: 4.92,
      reviewsCount: 89,
      sessionsCount: 205,
      completedSessions: 205,
      rate: 450,
      formattedRate: '₹450 /hr',
      location: 'Mumbai, Maharashtra',
      distance: '4.0 km away',
      pronouns: 'He/Him',
      lastActive: 'Online now',
      responseTime: '< 1 hour',
      responseRate: '94%',
      memberSince: '2023',
      isOnline: true,
      category: 'study',
      gender: 'Male',
      city: 'Mumbai',
      photos: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=800',
      ],
      languages: ['English', 'Mandarin', 'Hindi'],
      hobbies: ['Museums', 'History', 'Cycling'],
      personality: ['Thoughtful', 'Knowledgeable', 'Calm'],
      travelPreference: 'Willing to travel up to 15 km',
      pricing: [
        { activity: 'Art & Culture Tour', price: '₹450/hr', icon: 'palette-outline' },
        { activity: 'Coffee & Discussion', price: '₹400/hr', icon: 'coffee-outline' },
      ],
      schedule: 'Available Tomorrow: 10 AM - 4 PM',
      cancellationPolicy: 'Free cancellation up to 24 hours before the session.',
      rules: ['Public places only', 'Advance booking required'],
      verifications: [
        { label: 'ID Verified', icon: 'badge-account-horizontal-outline', color: '#10B981' },
        { label: 'Background Checked', icon: 'file-document-check-outline', color: '#10B981' },
      ],
      reviews: {
        average: 4.92,
        count: 89,
        categories: { punctuality: 4.8, communication: 4.9, behavior: 4.8 },
        items: [
          { id: 'r4', author: 'Priya', date: 'Aug 2026', activity: 'Art & Culture', text: 'Marcus knows so much about local museums. Loved every minute!' },
        ],
      },
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
