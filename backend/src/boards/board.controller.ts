import { Body, Controller, Get, Post, Put, Param, Query, Req, UseGuards, HttpException, Delete } from '@nestjs/common';
import { BoardService } from './board.service';
import { BoardMembershipService } from './membership.service';
import { BoardServiceSettingsService } from './service-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
// duplicate import removed
import { BoardJoinRequestService } from './join-request.service';
import { BoardServicePermissionsService } from './service-permissions.service';

interface CreateBoardDto {
  boardName: string;
  enabledServices?: string[];
  serviceSettings?: Record<string, any>;
}

interface UpdateBoardDto {
  boardName?: string;
  enabledServices?: string[];
}

@Controller('boards')
export class BoardController {
  constructor(
    private readonly boardService: BoardService,
    private readonly membershipService: BoardMembershipService,
    private readonly settingsService: BoardServiceSettingsService,
    private readonly joinReqService: BoardJoinRequestService,
    private readonly svcPerms: BoardServicePermissionsService,
  ) {}

  /** List all boards or by ownerId (optional query param) */
  @Get()
  async listBoards(@Query('ownerId') ownerId?: string) {
    if (ownerId) {
      return this.boardService.findByOwner(ownerId);
    }
    return this.boardService.listAll();
  }

  /** Return boards for current logged-in user (owned + managed) */
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async myBoards(@Req() req: Request) {
    const user: any = (req as any).user;
    if (!user?.sub) {
      throw new HttpException('Unauthorized', 401);
    }
    
    // Get boards owned by user
    const ownedBoards = await this.boardService.findByOwner(user.sub);
    
    // Get user's memberships to find boards where user is manager
    const memberships = await this.membershipService.listMembershipsForUser(user.sub);
    const managerMemberships = memberships.filter(m => m.role === 'manager');
    
    // Get board details for manager memberships
    const managedBoards = await Promise.all(
      managerMemberships.map(async (membership) => {
        const board = await this.boardService.findById(membership.boardId);
        return board;
      })
    );
    
    // Combine owned and managed boards, remove duplicates
    const allBoards = [...ownedBoards];
    managedBoards.forEach(board => {
      if (board && !allBoards.find(b => b.boardId === board.boardId)) {
        allBoards.push(board);
      }
    });
    
    return allBoards;
  }

  /** Create new board (unique name) */
  @UseGuards(JwtAuthGuard)
  @Post()
  async createBoard(@Req() req: Request, @Body() body: CreateBoardDto) {
    const { boardName } = body;
    if (!boardName) {
      throw new HttpException('boardName required', 400);
    }
    const user: any = (req as any).user;
    if (!user?.sub) {
      throw new HttpException('Unauthorized', 401);
    }
    try {
      const board = await this.boardService.create(boardName.trim(), user.sub, {
        enabledServices: body.enabledServices,
      });
      // Persist service settings if provided
      if (body.serviceSettings && body.enabledServices?.length) {
        const entries = Object.entries(body.serviceSettings).filter(([key]) =>
          body.enabledServices!.includes(key),
        );
        for (const [serviceKey, config] of entries) {
          await this.settingsService.put(board.boardId, serviceKey, config);
        }
      }
      return board;
    } catch (err: any) {
      if (err?.message === 'BOARD_NAME_EXISTS') {
        throw new HttpException('Board name already exists', 409);
      }
      throw new HttpException('Failed to create board', 500);
    }
  }

  /** Update board settings (owner only) */
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateBoard(@Param('id') boardId: string, @Req() req: Request, @Body() body: UpdateBoardDto) {
    const user: any = (req as any).user;
    if (!user?.sub) {
      throw new HttpException('Unauthorized', 401);
    }

    try {
      // Check if user is the owner of the board
      const board = await this.boardService.findById(boardId);
      if (!board) {
        throw new HttpException('Board not found', 404);
      }
      
      if (board.ownerId !== user.sub) {
        throw new HttpException('Only board owner can update settings', 403);
      }

      // Update the board
      const updatedBoard = await this.boardService.updateBoard(boardId, body);
      return updatedBoard;
    } catch (err: any) {
      if (err.status) {
        throw err; // Re-throw HTTP exceptions
      }
      if (err?.message === 'BOARD_NAME_EXISTS') {
        throw new HttpException('Board name already exists', 409);
      }
      throw new HttpException('Failed to update board', 500);
    }
  }

  // Enable or update service settings for a board
  @UseGuards(JwtAuthGuard)
  @Put(':id/services/:serviceKey')
  async enableOrUpdateService(
    @Param('id') boardId: string,
    @Param('serviceKey') serviceKey: string,
    @Req() req: Request,
    @Body() body: { config?: any },
  ) {
    const user: any = (req as any).user;
    if (!user?.sub) throw new HttpException('Unauthorized', 401);
    const board = await this.boardService.findById(boardId);
    if (!board) throw new HttpException('Board not found', 404);
    if (board.ownerId !== user.sub) throw new HttpException('Only board owner can update settings', 403);

    const enabled = new Set(board.enabledServices || []);
    enabled.add(serviceKey);
    await this.boardService.updateBoard(boardId, { enabledServices: Array.from(enabled) });
    await this.settingsService.put(boardId, serviceKey, body?.config ?? {});
    return { updated: true };
  }

  // Disable a service with cascade clean-up
  @UseGuards(JwtAuthGuard)
  @Delete(':id/services/:serviceKey')
  async disableService(
    @Param('id') boardId: string,
    @Param('serviceKey') serviceKey: string,
    @Req() req: Request,
  ) {
    const user: any = (req as any).user;
    if (!user?.sub) throw new HttpException('Unauthorized', 401);
    const board = await this.boardService.findById(boardId);
    if (!board) throw new HttpException('Board not found', 404);
    if (board.ownerId !== user.sub) throw new HttpException('Only board owner can update settings', 403);

    // Remove from enabledServices
    const next = (board.enabledServices || []).filter((k) => k !== serviceKey);
    await this.boardService.updateBoard(boardId, { enabledServices: next });

    // Cascade clean-up for service
    await this.settingsService.delete(boardId, serviceKey);
    // TODO: optionally revoke all service permissions for this service
    if (serviceKey === 'approveJoin') {
      await this.joinReqService.deleteAllForBoard(boardId);
    }
    return { disabled: true };
  }
}

