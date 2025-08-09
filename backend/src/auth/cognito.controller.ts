import { Controller, Post, Body, Res, Req, Get, UnauthorizedException, ForbiddenException, HttpException } from '@nestjs/common';
import { UserProfileService } from './user-profile.service';
import { CognitoService } from './cognito.service';
import { AuthService } from './auth.service';
import type { Response } from 'express';

@Controller()
export class CognitoController {
  constructor(
    private readonly cognitoService: CognitoService,
    private readonly authService: AuthService,
    private readonly userProfileService: UserProfileService,
  ) {}

  @Post('/signup')
  async signUp(@Body() body) {
    const { email, password } = body;
    return this.cognitoService.signUp(email, password);
  }

  @Post('/confirm')
  async confirmSignUp(@Body() body, @Res({ passthrough: true }) res: Response) {
    const { email, code } = body;
    await this.cognitoService.confirmSignUp(email, code);

    let sub: string | undefined;
    let userEmail = email;
    try {
      const userData = await this.cognitoService.adminGetUser(email);
      sub = userData?.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;
      userEmail = userData?.UserAttributes?.find(attr => attr.Name === 'email')?.Value ?? email;
      //console.log(`Confirmed Cognito user: sub=${sub}, email=${userEmail}`);
      if (sub) {
        const existing = await this.userProfileService.findById(sub);
        if (!existing) {
          await this.userProfileService.create(sub, userEmail);
        }
      }
      // issue login cookie so user can set username immediately
      if (sub) {
        const token = this.authService.signToken({ sub, email: userEmail });
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600000 * 24 * 7,
        });
      }
    } catch (err) {
      // Log but do not prevent confirmation from succeeding
      console.error('Failed to sync user profile to DynamoDB:', err);
    }

    return { message: 'Account confirmed successfully' };
  }

  @Post('/signin')
  async signIn(@Body() body, @Res({ passthrough: true }) res: Response) {
    const { email, password } = body;

    try {
      const authResult = await this.cognitoService.signIn(email, password);

      if (!authResult?.AccessToken) {
        throw new UnauthorizedException('Sign in failed: No access token returned');
      }

      const userInfo = await this.cognitoService.getUser(authResult.AccessToken);

      const userAttributes = userInfo.UserAttributes?.reduce((acc, attr) => {
        if (attr.Name) acc[attr.Name] = attr.Value;
        return acc;
      }, {}) || {};

      const tokenPayload: any = {
        sub: userInfo.Username,
        ...userAttributes,
      } as any;

      // include saved userName if exists
      try {
        const profile = await this.userProfileService.findById(userInfo.Username!);
        if (profile?.userName) {
          tokenPayload.userName = profile.userName;
        }
      } catch {}


      const token = this.authService.signToken(tokenPayload);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000 * 24 * 7, // 7 days
      });

      return { message: 'Sign in successful' };
    } catch (err: any) {
      // Handle Cognito specific errors gracefully
      const message: string = err?.name || err?.__type || 'Auth error';
      if (message.includes('UserNotConfirmedException')) {
        throw new ForbiddenException('User is not confirmed');
      }
      if (message.includes('NotAuthorizedException')) {
        throw new UnauthorizedException('Incorrect username or password');
      }
      throw new HttpException('Authentication failed', 500);
    }
  }

  @Get('/logout')
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    const cognitoDomain = process.env.COGNITO_DOMAIN;
    if (!cognitoDomain) {
      throw new Error('COGNITO_DOMAIN environment variable not set');
    }

    const clientId = process.env.COGNITO_CLIENT_ID;
    const logoutUri = process.env.COGNITO_LOGOUT_URI || (process.env.FRONTEND_URL || 'http://localhost:3001');

    res.clearCookie('token');

    const logoutUrl = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(
      logoutUri,
    )}`;

    //console.log('Redirecting to Cognito logout URL:', logoutUrl);

    res.redirect(logoutUrl);
  }
}
