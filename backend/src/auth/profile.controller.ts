import { Body, Controller, Get, HttpException, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserProfileService } from './user-profile.service';
import type { Request } from 'express';

interface UsernameDto { userName: string; }

@Controller('profile')
export class ProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  /** Return current user's profile */
  @UseGuards(JwtAuthGuard)
  @Get()
  async me(@Req() req: Request) {
    const user: any = (req as any).user; // added by JwtStrategy
    if (!user?.sub) {
      throw new HttpException('Unauthorized', 401);
    }
    const profile = await this.userProfileService.findById(user.sub);
    return profile;
  }

  /** Check if a username already exists (public) */
  @Get('username-exists')
  async usernameExists(@Query('username') username: string) {
    if (!username) {
      throw new HttpException('username query param required', 400);
    }
    const existing = await this.userProfileService.findByUserName(username);
    return { exists: !!existing };
  }

  /** Set or change username for logged-in user */
  @UseGuards(JwtAuthGuard)
  @Post('username')
  async setUsername(@Req() req: Request, @Body() body: UsernameDto) {
    const { userName } = body;
    if (!userName) {
      throw new HttpException('userName is required', 400);
    }
    const user: any = (req as any).user;
    if (!user?.sub) {
      throw new HttpException('Unauthorized', 401);
    }
    try {
      await this.userProfileService.updateUserName(user.sub, userName);
      return { success: true };
    } catch (err: any) {
      if (err?.message === 'USERNAME_EXISTS') {
        throw new HttpException('Username already exists', 409);
      }
      throw new HttpException('Failed to update username', 500);
    }
  }
}

