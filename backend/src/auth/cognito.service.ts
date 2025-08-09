import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import * as crypto from 'crypto';

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const clientId = this.configService.get<string>('COGNITO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('COGNITO_CLIENT_SECRET');

    if (!region || !clientId || !clientSecret) {
      throw new Error('AWS Region, Cognito Client ID, or Client Secret is not configured in environment variables.');
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.cognitoClient = new CognitoIdentityProviderClient({ region });
  }

  private createSecretHash(username: string): string {
    return crypto
      .createHmac('sha256', this.clientSecret)
      .update(username + this.clientId)
      .digest('base64');
  }

  async signUp(email, password) {
    const secretHash = this.createSecretHash(email);
    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
      SecretHash: secretHash,
    });
    return this.cognitoClient.send(command);
  }

  async confirmSignUp(email, code) {
    const secretHash = this.createSecretHash(email);
    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: email,
      ConfirmationCode: code,
      SecretHash: secretHash,
    });
    return this.cognitoClient.send(command);
  }

  async signIn(email, password) {
    const secretHash = this.createSecretHash(email);
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: secretHash,
      },
    });
    const response = await this.cognitoClient.send(command);
    return response.AuthenticationResult;
  }

  async getUser(accessToken: string) {
    const command = new GetUserCommand({
      AccessToken: accessToken,
    });
    return this.cognitoClient.send(command);
  }

  async adminGetUser(username: string) {
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    if (!userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID is not set in environment variables');
    }
    const command = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    });
    return this.cognitoClient.send(command);
  }
}
