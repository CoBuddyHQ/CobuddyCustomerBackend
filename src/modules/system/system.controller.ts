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
    'en', 'hi', 'mr', 'gu', 'bn', 'ta', 'te', 'kn', 'ml', 'pa', 'ur', 'or', 'hinglish', 'fr', 'es'
  ],
  genderOptions: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
  notificationCategories: [
    'request', 'session', 'safety', 'payout', 'support',
    'policy', 'training', 'system', 'wallet', 'promotion', 'reminder'
  ],
  activityCategories: [
    { id: 'INT-1', label: 'Italian Cuisine', type: 'CUISINE', multiplier: 1.0, icon: 'pizza', title: 'Italian Cuisine' },
    { id: 'INT-2', label: 'Museums', type: 'ACTIVITY', multiplier: 1.2, icon: 'bank', title: 'Museums' },
    { id: 'INT-3', label: 'Cafe Hopping', type: 'ACTIVITY', multiplier: 1.0, icon: 'coffee', title: 'Cafe Hopping' },
    { id: 'INT-4', label: 'Movies', type: 'ACTIVITY', multiplier: 1.0, icon: 'popcorn', title: 'Movies' },
    { id: 'INT-5', label: 'Concerts', type: 'ACTIVITY', multiplier: 1.5, icon: 'ticket-confirmation', title: 'Concerts' },
    { id: 'INT-6', label: 'Parks', type: 'ACTIVITY', multiplier: 1.0, icon: 'tree', title: 'Parks' },
    { id: 'INT-7', label: 'Sightseeing', type: 'ACTIVITY', multiplier: 1.2, icon: 'camera', title: 'Sightseeing' },
    { id: 'INT-8', label: 'Clubbing', type: 'ACTIVITY', multiplier: 1.5, icon: 'glass-cocktail', title: 'Clubbing' },
    { id: 'INT-9', label: 'Art Galleries', type: 'ACTIVITY', multiplier: 1.2, icon: 'palette', title: 'Art Galleries' },
    { id: 'INT-10', label: 'Hiking', type: 'ACTIVITY', multiplier: 1.5, icon: 'hiking', title: 'Hiking' },
    { id: 'INT-11', label: 'Board Games', type: 'ACTIVITY', multiplier: 1.0, icon: 'dice-multiple', title: 'Board Games' },
    { id: 'INT-12', label: 'Karaoke', type: 'ACTIVITY', multiplier: 1.2, icon: 'microphone', title: 'Karaoke' },
    { id: 'INT-13', label: 'Gaming', type: 'ACTIVITY', multiplier: 1.0, icon: 'controller-classic', title: 'Gaming' },
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
