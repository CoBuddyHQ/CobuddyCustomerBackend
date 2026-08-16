import { Controller, Get, Patch, Delete, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List customer notifications' })
  listNotifications(@CurrentCustomer() customer: any) {
    return this.notificationsService.listNotifications(customer.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark single notification as read' })
  markAsRead(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(customer.id, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentCustomer() customer: any) {
    return this.notificationsService.markAllAsRead(customer.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  deleteNotification(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.notificationsService.deleteNotification(customer.id, id);
  }

  @Post('device-token')
  @ApiOperation({ summary: 'Register FCM device token for push notifications' })
  registerDeviceToken(@CurrentCustomer() customer: any, @Body() body: { fcmToken: string }) {
    return this.notificationsService.registerDeviceToken(customer.id, body.fcmToken);
  }

  @Post('permission')
  @ApiOperation({ summary: 'Update push notification permissions and device token' })
  updatePermission(@CurrentCustomer() customer: any, @Body() body: { enabled?: boolean; fcmToken?: string; skipped?: boolean }) {
    return this.notificationsService.updateNotificationPermission(customer.id, body);
  }

  @Post('skip')
  @ApiOperation({ summary: 'Skip push notification setup step' })
  skipNotification(@CurrentCustomer() customer: any) {
    return this.notificationsService.skipNotificationPermission(customer.id);
  }
}
