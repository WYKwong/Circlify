import {
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  HttpException,
  Body,
} from '@nestjs/common';
import { BoardMembershipService } from './membership.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BoardService } from './board.service';
import { UserProfileService } from '../auth/user-profile.service';
import type { Request } from 'express';
import { BoardJoinRequestService } from './join-request.service';
import { BoardServiceSettingsService } from './service-settings.service';

@Controller('boards')
export class BoardMembershipController {
  private getAuthUser(req: Request): { sub?: string } {
    const user = (req as any).user as { sub?: string } | undefined;
    return user || {};
  }

  constructor(
    private readonly membershipService: BoardMembershipService,
    private readonly boardService: BoardService,
    private readonly joinReqService: BoardJoinRequestService,
    private readonly userProfileService: UserProfileService,
    private readonly settingsService: BoardServiceSettingsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  async join(@Param('id') id: string, @Req() req: Request) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);

    const board = await this.boardService.findById(id);
    if (!board) throw new HttpException('Board not found', 404);

    const already = await this.membershipService.isMember(board.boardId, user.sub);
    if (already) return { joined: false, reason: 'ALREADY' };

    const hasApprove = (board.enabledServices || []).includes('approveJoin');
    if (hasApprove) {
      // create request if not exists
      if (await this.joinReqService.hasPending(board.boardId, user.sub)) {
        return { requested: false, reason: 'PENDING' };
      }
      const setting = await this.settingsService.get<{ ttlDays?: number; askQuestion?: boolean; questionText?: string }>(
        board.boardId,
        'approveJoin',
      );
      const ttl = Math.max(1, Math.min(5, setting?.config?.ttlDays ?? 1));
      const ask = !!setting?.config?.askQuestion;
      const questionText = setting?.config?.questionText || '';
      if (ask && questionText.trim().length > 0) {
        // require /request flow with answer
        return { requested: false, reason: 'ANSWER_REQUIRED' };
      }
      await this.joinReqService.addRequest(board.boardId, user.sub, '', ttl);
      return { requested: true };
    }

    await this.membershipService.addMember(board.boardId, user.sub, 'member');
    return { joined: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-memberships')
  async myMemberships(@Req() req: Request) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);
    const ids = await this.membershipService.listBoardsForUser(user.sub);
    return { boardIds: ids };
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-memberships-detailed')
  async myMembershipsDetailed(@Req() req: Request) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);
    const memberships = await this.membershipService.listMembershipsForUser(user.sub);
    return { memberships };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/members/:role')
  async listMembersByRole(
    @Param('id') boardId: string,
    @Param('role') role: string,
    @Req() req: Request,
  ) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);
    
    // TODO: Check if user is owner of the board
    const members = await this.membershipService.listByRole(
      boardId,
      role as 'member' | 'manager',
    );
    
    // Enrich members with userName from UserProfiles
    const enrichedMembers = await Promise.all(
      members.map(async (member) => {
        const userProfile = await this.userProfileService.findById(member.userId);
        return {
          ...member,
          userName: userProfile?.userName || member.userId,
        };
      }),
    );
    
    return { members: enrichedMembers };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/members/search/:username')
  async searchMemberByUsername(
    @Param('id') boardId: string,
    @Param('username') username: string,
    @Req() req: Request
  ) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);
    
    // TODO: Check if user is owner of the board
    
    // First, get all members of this board
    const members = await this.membershipService.listByRole(boardId, 'member');
    const managers = await this.membershipService.listByRole(boardId, 'manager');
    const allMembers = [...members, ...managers];
    
    // Search for user with matching username
    for (const member of allMembers) {
      const userProfile = await this.userProfileService.findById(member.userId);
      if (userProfile?.userName === username) {
        return { 
          found: true, 
          member: {
            userId: member.userId,
            role: member.role,
            userName: userProfile.userName,
          }
        };
      }
    }
    
    return { found: false };
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/members/:userId/role')
  async updateMemberRole(
    @Param('id') boardId: string, 
    @Param('userId') userId: string, 
    @Body() body: { role: 'member'|'manager' },
    @Req() req: Request
  ) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);
    
    // TODO: Check if user is owner of the board
    await this.membershipService.updateRole(
      boardId,
      userId,
      body.role,
    );
    return { updated: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/permissions')
  async getBoardPermissions(@Param('id') boardId: string, @Req() req: Request) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);
    
    const board = await this.boardService.findById(boardId);
    if (!board) throw new HttpException('Board not found', 404);
    
    return { permissions: board.enabledServices || [] };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/members/:userId/permissions')
  async getMemberPermissions(
    @Param('id') boardId: string,
    @Param('userId') userId: string,
    @Req() req: Request
  ) {
    const user = this.getAuthUser(req);
    if (!user.sub) throw new HttpException('Unauthorized', 401);
    
    const member = await this.membershipService.getMember(boardId, userId);
    if (!member) throw new HttpException('Member not found', 404);
    // Deprecated
    return { permissions: [] };
  }
}
