import { Controller, Get, Patch, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { AccountService } from './account.service';

@ApiTags('Account')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get account settings' })
  getSettings(@CurrentCustomer() customer: any) {
    return this.accountService.getSettings(customer.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update account settings' })
  updateSettings(@CurrentCustomer() customer: any, @Body() body: any) {
    return this.accountService.updateSettings(customer.id, body);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get active logged-in device sessions' })
  getActiveSessions(@CurrentCustomer() customer: any) {
    return this.accountService.getActiveSessions(customer.id);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revoke active session' })
  revokeSession(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.accountService.revokeSession(customer.id, id);
  }

  @Get('blocked')
  @ApiOperation({ summary: 'List blocked users' })
  getBlockedUsers(@CurrentCustomer() customer: any) {
    return this.accountService.getBlockedUsers(customer.id);
  }

  @Post('block/:id')
  @ApiOperation({ summary: 'Block user' })
  blockUser(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.accountService.blockUser(customer.id, id);
  }

  @Delete('unblock/:id')
  @ApiOperation({ summary: 'Unblock user' })
  unblockUser(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.accountService.unblockUser(customer.id, id);
  }

  @Post('deactivate')
  @ApiOperation({ summary: 'Deactivate account' })
  deactivateAccount(@CurrentCustomer() customer: any) {
    return this.accountService.deactivateAccount(customer.id);
  }

  @Delete('delete')
  @ApiOperation({ summary: 'Delete account' })
  deleteAccount(@CurrentCustomer() customer: any) {
    return this.accountService.deleteAccount(customer.id);
  }
}
