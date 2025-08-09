import { Controller, Get, Put, Delete, Param, UseGuards, Req, HttpException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
import { BoardService } from './board.service';
import { BoardMembershipService } from './membership.service';
import { BoardServicePermissionsService } from './service-permissions.service';

@Controller('boards')
export class BoardServicePermissionsController {
  constructor(
    private readonly boardService: BoardService,
    private readonly membershipService: BoardMembershipService,
    private readonly perms: BoardServicePermissionsService,
  ) {}

  private async ensureOwner(boardId: string, userId: string) {
    const board = await this.boardService.findById(boardId);
    if (!board) throw new HttpException('Board not found', 404);
    if (board.ownerId !== userId) throw new HttpException('Forbidden', 403);
    return board;
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/services/:serviceKey/permissions/:userId')
  async grant(
    @Param('id') boardId: string,
    @Param('serviceKey') serviceKey: string,
    @Param('userId') targetUserId: string,
    @Req() req: Request,
  ) {
    const user: any = (req as any).user;
    if (!user?.sub) throw new HttpException('Unauthorized', 401);
    await this.ensureOwner(boardId, user.sub);
    await this.perms.grant(boardId, targetUserId, serviceKey, user.sub);
    return { granted: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/services/:serviceKey/permissions/:userId')
  async revoke(
    @Param('id') boardId: string,
    @Param('serviceKey') serviceKey: string,
    @Param('userId') targetUserId: string,
    @Req() req: Request,
  ) {
    const user: any = (req as any).user;
    if (!user?.sub) throw new HttpException('Unauthorized', 401);
    await this.ensureOwner(boardId, user.sub);
    await this.perms.revoke(boardId, targetUserId, serviceKey);
    return { revoked: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/services/:serviceKey/permissions')
  async list(
    @Param('id') boardId: string,
    @Param('serviceKey') serviceKey: string,
    @Req() req: Request,
  ) {
    const user: any = (req as any).user;
    if (!user?.sub) throw new HttpException('Unauthorized', 401);
    await this.ensureOwner(boardId, user.sub);
    const items = await this.perms.listForService(boardId, serviceKey);
    return items.map((i) => ({ userId: i.userId, grantedAt: i.grantedAt, grantedBy: i.grantedBy }));
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/services/:serviceKey/permissions/me')
  async hasForMe(
    @Param('id') boardId: string,
    @Param('serviceKey') serviceKey: string,
    @Req() req: Request,
  ) {
    const user: any = (req as any).user;
    if (!user?.sub) throw new HttpException('Unauthorized', 401);
    const board = await this.boardService.findById(boardId);
    if (!board) throw new HttpException('Board not found', 404);
    if (board.ownerId === user.sub) return { has: true };
    const member = await this.membershipService.getMember(boardId, user.sub);
    if (!member || member.role === 'member') return { has: false };
    const has = await this.perms.has(boardId, user.sub, serviceKey);
    return { has };
  }
}


