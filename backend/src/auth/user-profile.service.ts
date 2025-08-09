import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

export interface UserProfile {
  PK: string;
  SK: string;
  userId: string;
  email: string;
  createdAt?: string;
  userName?: string;
}

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    if (!region) {
      throw new Error('AWS_REGION is not set in environment variables');
    }

    this.tableName =
      this.configService.get<string>('USER_PROFILES_TABLE') || 'UserProfiles';

    const ddbClient = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(ddbClient);
  }

  private pk(userId: string) {
    return `USER#${userId}`;
  }

  async findById(userId: string): Promise<UserProfile | undefined> {
    try {
      const { Item } = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(userId), SK: 'PROFILE' },
        }),
      );
      return Item as UserProfile | undefined;
    } catch (error) {
      this.logger.error('Error fetching user profile', error as Error);
      throw error;
    }
  }

  /**
   * Find profile by userName (must be unique across table).
   * NOTE: For MVP we perform a Scan which is O(N). In production, consider creating
   * a Global Secondary Index on userName and Query instead.
   */
  private USERNAME_INDEX = 'userName-index';

  async findByUserName(userName: string): Promise<UserProfile | undefined> {
    // Prefer GSI query for efficiency; fallback to Scan if index absent
    try {
      const res: any = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.USERNAME_INDEX,
          KeyConditionExpression: 'userName = :u',
          ExpressionAttributeValues: { ':u': userName },
          Limit: 1,
        }),
      );
      return (res.Items && res.Items[0]) as UserProfile | undefined;
    } catch (error: any) {
      // If index not found, fallback to Scan (dev convenience)
      const msg = error?.message || '';
      if (msg.includes('specified index')) {
        this.logger.warn('GSI userName-index not found, falling back to Scan');
        const res: any = await this.docClient.send(
          new ScanCommand({
            TableName: this.tableName,
            FilterExpression: '#u = :u',
            ExpressionAttributeNames: { '#u': 'userName' },
            ExpressionAttributeValues: { ':u': userName },
            Limit: 1,
          }),
        );
        return (res.Items && res.Items[0]) as UserProfile | undefined;
      }
      this.logger.error('Error querying user profiles by username', error as Error);
      throw error;
    }
  }

  async updateUserName(userId: string, userName: string): Promise<void> {
    // Ensure unique username
    const duplicate = await this.findByUserName(userName);
    if (duplicate && duplicate.userId !== userId) {
      throw new Error('USERNAME_EXISTS');
    }

    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(userId), SK: 'PROFILE' },
          UpdateExpression: 'SET #n = :n',
          ExpressionAttributeNames: { '#n': 'userName' },
          ExpressionAttributeValues: { ':n': userName },
        }),
      );
    } catch (error) {
      this.logger.error('Error updating userName', error as Error);
      throw error;
    }
  }

  async create(userId: string, email: string): Promise<void> {
    const item: UserProfile = {
      PK: this.pk(userId),
      SK: 'PROFILE',
      userId,
      email,
      createdAt: new Date().toISOString(),
    } as UserProfile;
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
    } catch (error) {
      if ((error as any).name === 'ConditionalCheckFailedException') {
        // Item already exists; ignore
        this.logger.debug(`User profile with id ${userId} already exists`);
        return;
      }
      this.logger.error('Error creating user profile', error as Error);
      throw error;
    }
  }
}

