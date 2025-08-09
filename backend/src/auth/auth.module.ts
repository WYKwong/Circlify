import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { UserProfileService } from './user-profile.service';
import { ProfileController } from './profile.controller';
import { CognitoService } from './cognito.service';
import { CognitoController } from './cognito.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController, CognitoController, ProfileController],
  providers: [AuthService, UsersService, JwtStrategy, CognitoService, UserProfileService],
})
export class AuthModule {}
