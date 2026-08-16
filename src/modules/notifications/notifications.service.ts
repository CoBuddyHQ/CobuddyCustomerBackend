import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async listNotifications(customerId: string) {
    let notifications = await this.prisma.customerNotification.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });

    if (notifications.length === 0) {
      const now = new Date();
      await this.prisma.customerNotification.createMany({
        data: [
          {
            customerId,
            title: 'Booking Confirmed!',
            description: 'Your evening walk with Priya has been confirmed for tomorrow at 6 PM.',
            category: 'Bookings',
            icon: 'calendar-check',
            iconColor: '#10B981',
            route: 'BookingsTab',
            isRead: false,
            createdAt: new Date(now.getTime() - 2 * 60 * 1000),
          },
          {
            customerId,
            title: 'Booking Declined',
            description: 'Natasha is unavailable for Friday evening. Please check other companions.',
            category: 'Bookings',
            icon: 'calendar-remove',
            iconColor: '#EF4444',
            route: 'BookingsTab',
            isRead: false,
            createdAt: new Date(now.getTime() - 15 * 60 * 1000),
          },
          {
            customerId,
            title: 'New Counter Offer',
            description: 'Rahul has proposed a different time and price for your coffee meetup.',
            category: 'Bookings',
            icon: 'calendar-sync',
            iconColor: '#F59E0B',
            route: 'BookingsTab',
            isRead: false,
            createdAt: new Date(now.getTime() - 30 * 60 * 1000),
          },
          {
            customerId,
            title: 'Refund Processed',
            description: '₹1,500 has been successfully refunded to your CoBuddy Wallet.',
            category: 'Wallet',
            icon: 'wallet-plus',
            iconColor: '#D4AF37',
            route: 'WalletTab',
            isRead: false,
            createdAt: new Date(now.getTime() - 60 * 60 * 1000),
          },
          {
            customerId,
            title: 'New Login Detected',
            description: 'We detected a new login from an iPhone 14 Pro in New Delhi.',
            category: 'Security',
            icon: 'shield-alert',
            iconColor: '#EF4444',
            route: 'SafetySupportStack',
            isRead: true,
            createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
          },
          {
            customerId,
            title: 'Upcoming Meetup Reminder',
            description: "Don't forget! Your coffee meetup with Rahul starts in 2 hours.",
            category: 'Bookings',
            icon: 'clock-outline',
            iconColor: '#F59E0B',
            route: 'BookingsTab',
            isRead: true,
            createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
          },
        ],
      });
      notifications = await this.prisma.customerNotification.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });
    }

    const unreadCount = notifications.filter(n => !n.isRead).length;
    return { notifications, unreadCount };
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
