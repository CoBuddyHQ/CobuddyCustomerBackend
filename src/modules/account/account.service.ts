import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { QA_TEST_OTP, isReservedTestOtp, isTestPhoneAllowlisted, isTestOtpAllowed } from '../../common/utils/otp-test.util';

@Injectable()
export class AccountService {
  constructor(private prisma: PrismaService) {}

  async getSettings(customerId: string) {
    const setting = await this.prisma.customerSetting.findUnique({
      where: { customerId },
    });
    if (!setting) {
      return this.prisma.customerSetting.create({ data: { customerId } });
    }
    return setting;
  }

  async updateSettings(customerId: string, data: any) {
    return this.prisma.customerSetting.upsert({
      where: { customerId },
      create: { customerId, ...data },
      update: data,
    });
  }

  async getActiveSessions(customerId: string) {
    return this.prisma.customerRefreshToken.findMany({
      where: { customerId },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(customerId: string, sessionId: string) {
    await this.prisma.customerRefreshToken.deleteMany({
      where: { id: sessionId, customerId },
    });
    return { message: 'Session revoked' };
  }

  async blockUser(customerId: string, blockedId: string) {
    await this.prisma.customerBlock.upsert({
      where: { blockerId_blockedId: { blockerId: customerId, blockedId } },
      create: { blockerId: customerId, blockedId },
      update: {},
    });
    return { message: 'User blocked' };
  }

  async unblockUser(customerId: string, blockedId: string) {
    await this.prisma.customerBlock.deleteMany({
      where: { blockerId: customerId, blockedId },
    });
    return { message: 'User unblocked' };
  }

  async getBlockedUsers(customerId: string) {
    return this.prisma.customerBlock.findMany({
      where: { blockerId: customerId },
    });
  }

  async deactivateAccount(customerId: string) {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { accountStatus: 'deactivated' },
    });
    await this.prisma.customerRefreshToken.deleteMany({ where: { customerId } });
    return { message: 'Account deactivated successfully' };
  }

  async deleteAccount(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    // Permanently purge customer and cascade all related records (bookings, sessions, kyc, etc.)
    await this.prisma.customer.delete({
      where: { id: customerId },
    });
    return { success: true, message: 'Account and all associated personal data have been permanently deleted.' };
  }

  async getNotificationPreferences(customerId: string) {
    const setting = await this.getSettings(customerId);
    return {
      bookings: setting.bookingNotifications ?? true,
      messages: setting.chatNotifications ?? true,
      promotions: setting.marketingNotifications ?? false,
      safety: setting.safetyNotifications ?? true,
      system: true,
      // Detailed toggles
      bookingPush: setting.bookingNotifications ?? true,
      bookingReminders: setting.bookingNotifications ?? true,
      bookingEmail: setting.bookingNotifications ?? true,
      chatPush: setting.chatNotifications ?? true,
      walletAlerts: setting.bookingNotifications ?? true,
      reviewPush: setting.bookingNotifications ?? true,
      promoPush: setting.marketingNotifications ?? false,
      sosAlerts: true,
    };
  }

  async updateNotificationPreferences(customerId: string, prefs: any) {
    return this.prisma.customerSetting.update({
      where: { customerId },
      data: {
        bookingNotifications: prefs.bookings ?? prefs.bookingPush ?? prefs.bookingReminders ?? true,
        chatNotifications: prefs.messages ?? prefs.chatPush ?? true,
        marketingNotifications: prefs.promotions ?? prefs.promoPush ?? false,
        safetyNotifications: prefs.safety ?? true,
      },
    });
  }

  async getLanguages(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { spokenLanguages: true },
    });
    const setting = await this.getSettings(customerId);
    return {
      appLanguage: setting.language ?? 'en',
      spokenLanguages: customer?.spokenLanguages ?? ['English', 'Hindi'],
    };
  }

  async updateLanguages(customerId: string, data: { appLanguage?: string; spokenLanguages?: string[] }) {
    if (data.appLanguage) {
      await this.prisma.customerSetting.update({
        where: { customerId },
        data: { language: data.appLanguage },
      });
    }
    if (data.spokenLanguages) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { spokenLanguages: data.spokenLanguages },
      });
    }
    return { success: true, message: 'Language preferences updated' };
  }

  async submitReactivationRequest(data: { phone?: string; email?: string; reason?: string }) {
    void data;
    throw new ServiceUnavailableException(
      'Reactivation review is not connected. No request was recorded.',
    );
  }

  // ── CHANGE MOBILE NUMBER (2-STEP OTP VERIFICATION) ────────────────────────
  async requestChangeMobileOtp(customerId: string, oldPhone: string, newPhone: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.phone !== oldPhone) {
      throw new NotFoundException('Old phone number does not match current registered account number');
    }
    if (oldPhone === newPhone) throw new BadRequestException('The new number must differ from the current number');

    const existingNew = await this.prisma.customer.findUnique({ where: { phone: newPhone } });
    if (existingNew && existingNew.id !== customerId) {
      throw new BadRequestException('New phone number is already registered to another account');
    }

    const qaNumbersAllowed = isTestPhoneAllowlisted(oldPhone) && isTestPhoneAllowlisted(newPhone);
    if (!qaNumbersAllowed) {
      throw new ServiceUnavailableException(
        'SMS delivery is not integrated. No OTP was generated or sent for this number change.',
      );
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const qaOtpHash = await bcrypt.hash(QA_TEST_OTP, 10);
    await this.prisma.customerOtp.deleteMany({ where: { phone: { in: [oldPhone, newPhone] } } });
    await this.prisma.customerOtp.createMany({
      data: [
        { phone: oldPhone, otp: qaOtpHash, expiresAt },
        { phone: newPhone, otp: qaOtpHash, expiresAt },
      ],
    });

    return {
      success: true,
      message: 'QA OTP records prepared for allowlisted numbers; no SMS was sent.',
    };
  }

  async verifyChangeMobile(customerId: string, oldPhone: string, newPhone: string, oldOtp: string, newOtp: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.phone !== oldPhone) {
      throw new NotFoundException('Current account number mismatch');
    }
    if (oldPhone === newPhone) throw new BadRequestException('The new number must differ from the current number');

    const existingNew = await this.prisma.customer.findUnique({ where: { phone: newPhone } });
    if (existingNew && existingNew.id !== customerId) {
      throw new BadRequestException('New phone number is already registered to another account');
    }

    if (isReservedTestOtp(oldOtp) && !isTestOtpAllowed(oldPhone, oldOtp)) {
      throw new UnauthorizedException('Invalid OTP for old phone number');
    }
    if (isReservedTestOtp(newOtp) && !isTestOtpAllowed(newPhone, newOtp)) {
      throw new UnauthorizedException('Invalid OTP for new phone number');
    }

    const [oldRecord, newRecord] = await Promise.all([
      this.prisma.customerOtp.findFirst({ where: { phone: oldPhone }, orderBy: { createdAt: 'desc' } }),
      this.prisma.customerOtp.findFirst({ where: { phone: newPhone }, orderBy: { createdAt: 'desc' } }),
    ]);
    const maxAttempts = Number.parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10);
    if (!oldRecord || oldRecord.expiresAt < new Date() || oldRecord.attempts >= maxAttempts) {
      throw new BadRequestException('Invalid, expired, or locked OTP for old phone number');
    }
    if (!newRecord || newRecord.expiresAt < new Date() || newRecord.attempts >= maxAttempts) {
      throw new BadRequestException('Invalid, expired, or locked OTP for new phone number');
    }

    const matches = async (stored: string, submitted: string) =>
      /^\$2[aby]\$/.test(stored) ? bcrypt.compare(submitted, stored) : stored === submitted;
    const [oldMatches, newMatches] = await Promise.all([
      matches(oldRecord.otp, oldOtp),
      matches(newRecord.otp, newOtp),
    ]);
    if (!oldMatches || !newMatches) {
      await Promise.all([
        ...(!oldMatches ? [this.prisma.customerOtp.update({ where: { id: oldRecord.id }, data: { attempts: { increment: 1 } } })] : []),
        ...(!newMatches ? [this.prisma.customerOtp.update({ where: { id: newRecord.id }, data: { attempts: { increment: 1 } } })] : []),
      ]);
      throw new UnauthorizedException('Invalid OTP for mobile number change');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customerId }, data: { phone: newPhone } });
      await tx.customerOtp.deleteMany({ where: { phone: { in: [oldPhone, newPhone] } } });
    });

    return {
      success: true,
      message: 'Mobile number updated successfully',
      newPhone,
    };
  }
}
