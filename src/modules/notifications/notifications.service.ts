import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async listNotifications(customerId: string) {
    const notifications = await this.prisma.customerNotification.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
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
}
