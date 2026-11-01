import { Controller, Get, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ACTIVITY_CATEGORIES } from '../../common/constants/activity-catalog';
import { CompanionClientService } from '../companion-client/companion-client.service';

export const ADMIN_VALUES = {
  walletBalanceLimits: { nonKycMax: 10000 },
  commission: {
    minimumWithdrawalAmount: 1000,
    serviceFee: 50,
    platformFeePercentage: 15,
    taxPercentage: 18,
  },
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
  activityCategories: ACTIVITY_CATEGORIES,
};

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(@Optional() private readonly companionClient?: CompanionClientService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get remote system configurations (force update, maintenance, legal URLs)' })
  async getConfig() {
    const bundle = await this.companionClient?.getMasterDataBundle().catch(() => null);
    const defaults = bundle?.defaults;
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
      adminValues: {
        ...ADMIN_VALUES,
        walletBalanceLimits: {
          nonKycMax: defaults?.nonKycMaxWalletBalance ?? ADMIN_VALUES.walletBalanceLimits.nonKycMax,
        },
        commission: {
          minimumWithdrawalAmount: ADMIN_VALUES.commission.minimumWithdrawalAmount,
          serviceFee: defaults?.serviceFeePerBooking ?? ADMIN_VALUES.commission.serviceFee,
          platformFeePercentage: defaults?.platformCommissionRate ?? ADMIN_VALUES.commission.platformFeePercentage,
          taxPercentage: ADMIN_VALUES.commission.taxPercentage,
        },
        pricing: {
          cancellationFeePercentage: defaults?.cancellationFeePercentage ?? ADMIN_VALUES.pricing.cancellationFeePercentage,
        },
        cities: bundle?.cities || [],
        interests: bundle?.interests || [],
        languages: bundle?.languages || [],
      },
    };
  }

  @Get('master-data')
  @ApiOperation({ summary: 'Get master categories, activities, languages, multipliers, review tags, and refund tiers' })
  getMasterData() {
    const bundle = this.companionClient?.getCachedMasterBundle();
    if (!bundle) return ADMIN_VALUES;

    return {
      ...ADMIN_VALUES,
      cities: bundle.cities || [],
      interests: (bundle.interests && bundle.interests.length > 0) ? bundle.interests : ADMIN_VALUES.activityCategories,
      spokenLanguages: (bundle.languages && bundle.languages.length > 0) ? bundle.languages.map((l: any) => l.code) : ADMIN_VALUES.spokenLanguages,
      defaults: bundle.defaults,
    };
  }

  @Get('master-data/live')
  @ApiOperation({ summary: 'Fetch fresh master data directly from Admin' })
  async getLiveMasterData() {
    const bundle = await this.companionClient?.getMasterDataBundle().catch(() => null);
    if (!bundle) return ADMIN_VALUES;

    return {
      ...ADMIN_VALUES,
      cities: bundle.cities || [],
      interests: (bundle.interests && bundle.interests.length > 0) ? bundle.interests : ADMIN_VALUES.activityCategories,
      spokenLanguages: (bundle.languages && bundle.languages.length > 0) ? bundle.languages.map((l: any) => l.code) : ADMIN_VALUES.spokenLanguages,
      defaults: bundle.defaults,
    };
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
