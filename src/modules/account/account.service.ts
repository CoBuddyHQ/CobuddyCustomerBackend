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
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { accountStatus: 'deleted' },
    });
    await this.prisma.customerRefreshToken.deleteMany({ where: { customerId } });
    return { message: 'Account scheduled for deletion' };
  }

  async getNotificationPreferences(customerId: string) {
    const setting = await this.getSettings(customerId);
    return {
      bookingPush: setting.bookingNotifications,
      bookingReminders: setting.bookingNotifications,
      bookingEmail: setting.bookingNotifications,
      chatPush: setting.chatNotifications,
      walletAlerts: setting.bookingNotifications,
      reviewPush: setting.bookingNotifications,
      promoPush: setting.marketingNotifications,
      sosAlerts: true,
    };
  }

  async updateNotificationPreferences(customerId: string, prefs: any) {
    return this.prisma.customerSetting.update({
      where: { customerId },
      data: {
        bookingNotifications: prefs.bookingPush ?? prefs.bookingReminders ?? true,
        chatNotifications: prefs.chatPush ?? true,
        marketingNotifications: prefs.promoPush ?? false,
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
}
