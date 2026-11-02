import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async listNotifications(customerId: string, page = 1, limit = 20) {
    const validPage = Math.max(1, Number(page) || 1);
    const validLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (validPage - 1) * validLimit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.customerNotification.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: validLimit,
      }),
      this.prisma.customerNotification.count({ where: { customerId } }),
      this.prisma.customerNotification.count({ where: { customerId, isRead: false } }),
    ]);

    return {
      notifications,
      unreadCount,
      total,
      page: validPage,
      limit: validLimit,
      hasMore: skip + notifications.length < total,
    };
  }

  async markAsRead(customerId: string, notificationId: string) {
    const notification = await this.prisma.customerNotification.findFirst({
      where: { id: notificationId, customerId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.customerNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(customerId: string) {
    await this.prisma.customerNotification.updateMany({
      where: { customerId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'All notifications marked as read' };
  }

  async deleteNotification(customerId: string, notificationId: string) {
    const notification = await this.prisma.customerNotification.findFirst({
      where: { id: notificationId, customerId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    await this.prisma.customerNotification.delete({ where: { id: notificationId } });
    return { message: 'Notification deleted' };
  }

  async registerDeviceToken(customerId: string, fcmToken: string) {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { fcmToken },
    });
    return { message: 'Device token registered' };
  }

  async updateNotificationPermission(customerId: string, data: { enabled?: boolean; fcmToken?: string; skipped?: boolean }) {
    const enabled = data.enabled ?? !data.skipped;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.fcmToken && { fcmToken: data.fcmToken }),
        onboardingStep: 'profile_setup',
      },
    });

    const settings = await this.prisma.customerSetting.upsert({
      where: { customerId },
      create: {
        customerId,
        notificationsEnabled: enabled,
        bookingNotifications: enabled,
        safetyNotifications: enabled,
        chatNotifications: enabled,
      },
      update: {
        notificationsEnabled: enabled,
        bookingNotifications: enabled,
        safetyNotifications: enabled,
        chatNotifications: enabled,
      },
    });

    return {
      success: true,
      message: data.skipped ? 'Notification step skipped' : 'Notifications configured successfully',
      notificationsEnabled: settings.notificationsEnabled,
      onboardingStep: 'profile_setup',
    };
  }

  async skipNotificationPermission(customerId: string) {
    return this.updateNotificationPermission(customerId, { enabled: false, skipped: true });
  }
}
