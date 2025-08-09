import { Body, Controller, Get, Param, Post, Req, UseGuards, HttpException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BoardJoinRequestService } from './join-request.service';
import { BoardService } from './board.service';
import { BoardServiceSettingsService } from './service-settings.service';
import { BoardMembershipService } from './membership.service';
import type { Request } from 'express';

interface RequestDto { answer?: string; }

@Controller('boards')
export class BoardJoinRequestController {
  constructor(
    private readonly reqService: BoardJoinRequestService,
    private readonly boardService: BoardService,
    private readonly membershipService: BoardMembershipService,
    private readonly settingsService: BoardServiceSettingsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post(':id/request')
  async requestJoin(@Param('id') id: string, @Body() body: RequestDto, @Req() req: Request) {
    const user: any = (req as any).user;
    if (!user?.sub) throw new HttpException('Unauthorized', 401);
    const board = await this.boardService.findById(id);
    if (!board) throw new HttpException('Board not found', 404);

    if (await this.membershipService.isMember(board.boardId, user.sub)) {
      throw new HttpException('Already member', 409);
    }

    const hasApprove = (board.enabledServices || []).includes('approveJoin');
    if (!hasApprove) {
      // shouldn't hit here, join directly
      await this.membershipService.addMember(board.boardId, user.sub, 'member');
      return { joined: true };
    }

    const setting = await this.settingsService.get<{ ttlDays?: number; askQuestion?: boolean; questionText?: string }>(
      board.boardId,
      'approveJoin',
    );
    const ttl = Math.max(1, Math.min(5, setting?.config?.ttlDays ?? 1));
    const ask = !!setting?.config?.askQuestion;
    const questionText = setting?.config?.questionText || '';
    if (ask && questionText.trim().length > 0 && !(body.answer && body.answer.trim())) {
      throw new HttpException('Answer required', 400);
    }
    try {
      await this.reqService.addRequest(board.boardId, user.sub, body.answer, ttl);
      return { requested: true };
    } catch (err: any) {
      if (err.message === 'PENDING') throw new HttpException('Already requested', 409);
      throw new HttpException('Failed to request', 500);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/requests')
  async list(@Param('id') id: string, @Req() req: Request) {
    const user: any = (req as any).user;
    const board = await this.boardService.findById(id);
    if (!board || board.ownerId !== user.sub) throw new HttpException('Forbidden', 403);
    return this.reqService.listRequests(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/requests/:uid/approve')
  async approve(@Param('id') id: string, @Param('uid') uid: string, @Req() req: Request) {
    const user: any = (req as any).user;
    const board = await this.boardService.findById(id);
    if (!board || board.ownerId !== user.sub) throw new HttpException('Forbidden', 403);
    await this.membershipService.addMember(board.boardId, uid, 'member');
    await this.reqService.approve(id, uid);
    return { approved: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/requests/:uid/reject')
  async reject(@Param('id') id: string, @Param('uid') uid: string, @Req() req: Request) {
    const user: any = (req as any).user;
    const board = await this.boardService.findById(id);
    if (!board || board.ownerId !== user.sub) throw new HttpException('Forbidden', 403);
    await this.reqService.reject(id, uid);
    return { rejected: true };
  }
}

