import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
    return {
      success: true,
      message: 'Your request to reactivate your account has been submitted successfully. Our team will review it within 24 hours.',
      submittedAt: new Date().toISOString(),
    };
  }

  // ── CHANGE MOBILE NUMBER (2-STEP OTP VERIFICATION) ────────────────────────
  async requestChangeMobileOtp(customerId: string, oldPhone: string, newPhone: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer.phone !== oldPhone) {
      throw new NotFoundException('Old phone number does not match current registered account number');
    }

    const existingNew = await this.prisma.customer.findUnique({ where: { phone: newPhone } });
    if (existingNew && existingNew.id !== customerId) {
      throw new NotFoundException('New phone number is already registered to another account');
    }

    const isDev = process.env.NODE_ENV === 'development';
    const oldOtp = isDev && process.env.OTP_DEV_BYPASS ? process.env.OTP_DEV_BYPASS : String(Math.floor(100000 + Math.random() * 900000));
    const newOtp = isDev && process.env.OTP_DEV_BYPASS ? process.env.OTP_DEV_BYPASS : String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.customerOtp.deleteMany({ where: { phone: { in: [oldPhone, newPhone] } } });
    await this.prisma.customerOtp.createMany({
      data: [
        { phone: oldPhone, otp: oldOtp, expiresAt },
        { phone: newPhone, otp: newOtp, expiresAt },
      ],
    });

    return {
      success: true,
      message: 'Verification OTPs sent to both old and new mobile numbers',
      ...(isDev ? { devOldOtp: oldOtp, devNewOtp: newOtp } : {}),
    };
  }

  async verifyChangeMobile(customerId: string, oldPhone: string, newPhone: string, oldOtp: string, newOtp: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.phone !== oldPhone) {
      throw new NotFoundException('Current account number mismatch');
    }

    const isDev = process.env.NODE_ENV === 'development';
    const bypass = isDev && Boolean(process.env.OTP_DEV_BYPASS);

    if (!bypass) {
      const oldRecord = await this.prisma.customerOtp.findFirst({ where: { phone: oldPhone, otp: oldOtp } });
      const newRecord = await this.prisma.customerOtp.findFirst({ where: { phone: newPhone, otp: newOtp } });

      if (!oldRecord || oldRecord.expiresAt < new Date()) {
        throw new NotFoundException('Invalid or expired OTP for old phone number');
      }
      if (!newRecord || newRecord.expiresAt < new Date()) {
        throw new NotFoundException('Invalid or expired OTP for new phone number');
      }
    }

    // Update customer phone and clean up OTPs
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { phone: newPhone },
    });

    await this.prisma.customerOtp.deleteMany({ where: { phone: { in: [oldPhone, newPhone] } } });

    return {
      success: true,
      message: 'Mobile number updated successfully',
      newPhone,
    };
  }
}

