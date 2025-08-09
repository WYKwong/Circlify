import { Module } from '@nestjs/common';
import { BoardService } from './board.service';
import { BoardController } from './board.controller';
import { ConfigModule } from '@nestjs/config';
import { BoardMembershipService } from './membership.service';
import { BoardMembershipController } from './membership.controller';
import { BoardJoinRequestService } from './join-request.service';
import { BoardJoinRequestController } from './join-request.controller';
import { UserProfileService } from '../auth/user-profile.service';
import { AvailableServicesService } from './services.service';
import { AvailableServicesController } from './services.controller';
import { BoardServiceSettingsService } from './service-settings.service';
import { BoardServiceSettingsController } from './service-settings.controller';
import { BoardServicePermissionsController } from './service-permissions.controller';
import { BoardServicePermissionsService } from './service-permissions.service';

@Module({
  imports: [ConfigModule],
  providers: [BoardService, BoardMembershipService, BoardJoinRequestService, UserProfileService, AvailableServicesService, BoardServiceSettingsService, BoardServicePermissionsService],
  controllers: [BoardController, BoardMembershipController, BoardJoinRequestController, AvailableServicesController, BoardServiceSettingsController, BoardServicePermissionsController],
  exports: [BoardService],
})
export class BoardModule {}

