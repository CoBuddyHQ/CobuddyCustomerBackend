import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

export const ADMIN_VALUES = {
  walletBalanceLimits: { nonKycMax: 10000 },
  commission: { minimumWithdrawalAmount: 1000, serviceFee: 50 },
  pricing: { cancellationFeePercentage: 10 },
  cancellationRefundTiers: {
    tier1: { minHours: 48, refundPercent: 100 },
    tier2: { minHours: 24, maxHours: 48, refundPercent: 50 },
    tier3: { maxHours: 24, refundPercent: 0 },
  },
  venue: {
    allowedPlaceTypes: ['cafe', 'restaurant', 'park', 'museum', 'book_store', 'shopping_mall', 'movie_theater', 'amusement_park'],
    excludedPlaceTypes: ['lodging', 'bar'],
  },
  reviewTags: {
    praise: ['great_listener', 'dressed_well', 'safe_comforting', 'punctual'],
    concern: ['catfished_fake_profile', 'boring', 'late', 'rude_unprofessional', 'made_uncomfortable'],
  },
  ticketCategories: [
    'payment_payout', 'booking_session', 'safety_incident', 'verification',
    'account_access', 'dispute', 'general', 'age_minor_escalation', 'marketing_promo', 'feedback'
  ],
  incidentTypes: [
    'harassment', 'safety_concern', 'no_show', 'payment_dispute', 'inappropriate_behavior',
    'emergency', 'unauthorized_recording', 'privacy_violation', 'scam', 'no_show_customer',
    'identity_mismatch', 'other'
  ],
  cancellationReasons: [
    'found_another_companion', 'booked_by_mistake', 'changed_mind',
    'personal_emergency', 'unresponsive'
  ],
  disputeReasons: [
    'payment_not_received', 'unfair_cancellation', 'false_review', 'no_show',
    'service_quality', 'different_profile', 'early_end', 'companion_late',
    'customer_late', 'safety_concern', 'other'
  ],
  kycDocTypes: ['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID'],
  spokenLanguages: [
    'English', 'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati',
    'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Hinglish', 'French'
  ],
  genderOptions: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
  notificationCategories: [
    'request', 'session', 'safety', 'payout', 'support',
    'policy', 'training', 'system', 'wallet', 'promotion', 'reminder'
  ],
  activityCategories: [
    { id: 'INT-1', title: 'Cafe Conversation', icon: 'coffee-outline', multiplier: 1.0, description: 'Casual conversation at a cafe' },
    { id: 'INT-2', title: 'City Walk', icon: 'walk', multiplier: 1.0, description: 'Explore the city together on foot' },
    { id: 'INT-3', title: 'Art & Culture', icon: 'palette-outline', multiplier: 1.2, description: 'Visit museums and art galleries' },
    { id: 'INT-4', title: 'Food & Dining', icon: 'silverware-fork-knife', multiplier: 1.1, description: 'Explore local food and restaurants' },
    { id: 'INT-5', title: 'Shopping Assistance', icon: 'shopping-outline', multiplier: 1.0, description: 'Shopping companion and styling advice' },
    { id: 'INT-6', title: 'Movies & Cinema', icon: 'movie-outline', multiplier: 1.0, description: 'Watch movies together in public theaters' },
    { id: 'INT-7', title: 'Study & Work', icon: 'book-open-outline', multiplier: 0.9, description: 'Quiet work or study companionship' },
    { id: 'INT-8', title: 'Events & Concerts', icon: 'ticket-outline', multiplier: 1.3, description: 'Attend public cultural events or concerts' },
    { id: 'INT-9', title: 'Business Networking', icon: 'briefcase-outline', multiplier: 1.4, description: 'Professional companion for networking' },
    { id: 'INT-10', title: 'Bookstore & Library', icon: 'bookshelf', multiplier: 0.9, description: 'Browse books and quiet literature talk' },
    { id: 'INT-11', title: 'Wellness & Fitness Walk', icon: 'heart-pulse', multiplier: 1.0, description: 'Outdoor walking and wellness chats' },
    { id: 'INT-12', title: 'Sightseeing Tour', icon: 'city-variant-outline', multiplier: 1.25, description: 'Curated historical and city tours' },
    { id: 'INT-13', title: 'Board Games & Arcades', icon: 'gamepad-variant-outline', multiplier: 1.1, description: 'Play board games or arcade gaming in public venues' },
  ],
};

@ApiTags('System')
@Controller('system')
export class SystemController {
  @Get('config')
  @ApiOperation({ summary: 'Get remote system configurations (force update, maintenance, legal URLs)' })
  getConfig() {
    return {
      minAppVersion: '1.0.0',
      currentAppVersion: '1.0.0',
      forceUpdate: false,
      isMaintenanceMode: false,
      maintenanceMessage: 'We are currently performing scheduled maintenance. Please check back shortly.',
      supportEmail: 'support@cobuddy.club',
      supportPhone: '+91 80000 12345',
      policyUrls: {
        privacy: 'https://cobuddy.club/privacy',
        terms: 'https://cobuddy.club/terms',
        safety: 'https://cobuddy.club/safety',
        communityGuidelines: 'https://cobuddy.club/guidelines',
      },
      adminValues: ADMIN_VALUES,
    };
  }

  @Get('master-data')
  @ApiOperation({ summary: 'Get master categories, activities, languages, multipliers, review tags, and refund tiers' })
  getMasterData() {
    return ADMIN_VALUES;
  }

  @Get('status')
  @ApiOperation({ summary: 'Get server health and uptime status' })
  getStatus() {
    return {
      status: 'operational',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'cobuddy-customer-backend',
    };
  }
}
