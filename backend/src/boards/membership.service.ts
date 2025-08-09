import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export interface Membership {
  PK: string; // BOARD#<id>
  SK: string; // USER#<id>
  boardId: string;
  userId: string;
  role: 'owner' | 'member' | 'manager';
  joinedAt?: string;
}

@Injectable()
export class BoardMembershipService {
  private readonly logger = new Logger(BoardMembershipService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private USER_INDEX = 'userId-index';

  constructor(private readonly configService: ConfigService) {
    const region = configService.get<string>('AWS_REGION');
    if (!region) throw new Error('AWS_REGION env missing');
    const tbl = configService.get<string>('TABLES.BOARD_MEMBERSHIPS_TABLE') || configService.get<string>('BOARD_MEMBERSHIPS_TABLE');
    if (!tbl) throw new Error('BOARD_MEMBERSHIPS_TABLE env missing');
    this.tableName = tbl;
    this.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  private pk(boardId: string) { return `BOARD#${boardId}`; }
  private sk(userId: string) { return `USER#${userId}`; }

  async isMember(boardId: string, userId: string): Promise<boolean> {
    const { Item } = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { PK: this.pk(boardId), SK: this.sk(userId) },
    }));
    return !!Item;
  }

  async addMember(boardId: string, userId: string, role: 'owner'|'member'|'manager'): Promise<void> {
    const membership: Membership = {
      PK: this.pk(boardId),
      SK: this.sk(userId),
      boardId,
      userId,
      role,
      joinedAt: new Date().toISOString(),
    };
    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: membership,
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
  }

  async updateRole(boardId: string, userId: string, role: 'member'|'manager'): Promise<void> {
    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        PK: this.pk(boardId),
        SK: this.sk(userId),
        boardId,
        userId,
        role,
      },
    }));
  }

  async listByRole(boardId: string, role: 'member'|'manager'): Promise<Membership[]> {
    const res: any = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :p',
      ExpressionAttributeValues: { ':p': this.pk(boardId), ':r': role },
      FilterExpression: '#r = :r',
      ExpressionAttributeNames: { '#r': 'role' },
    }));
    return res.Items || [];
  }

  async listBoardsForUser(userId: string): Promise<string[]> {
    try {
      const res: any = await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: this.USER_INDEX,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ProjectionExpression: 'boardId',
      }));
      return (res.Items || []).map((i: any) => i.boardId as string);
    } catch (error: any) {
      if ((error.message || '').includes('specified index')) {
        // fallback scan
        const res: any = await this.docClient.send(new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': userId },
          ProjectionExpression: 'boardId',
        }));
        return (res.Items || []).map((i: any) => i.boardId as string);
      }
      throw error;
    }
  }

  async listMembershipsForUser(userId: string): Promise<Membership[]> {
    try {
      const res: any = await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: this.USER_INDEX,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
      }));
      return res.Items || [];
    } catch (error: any) {
      if ((error.message || '').includes('specified index')) {
        // fallback scan
        const res: any = await this.docClient.send(new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': userId },
        }));
        return res.Items || [];
      }
      throw error;
    }
  }

    async findMemberByUsername(boardId: string, username: string): Promise<Membership | null> {
    try {
      // First, get all members of this board
      const res: any = await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :p',
        ExpressionAttributeValues: { ':p': this.pk(boardId) },
      }));

      if (!res.Items || res.Items.length === 0) {
        return null;
      }

      // For each member, we need to check their username in UserProfiles
      // This would require a separate service call to UserProfileService
      // For now, we'll return the first member and let the controller handle the username check
      return res.Items[0] as Membership;
    } catch (error: any) {
      this.logger.error('Error finding member by username:', error);
      return null;
    }
  }

  async getMember(boardId: string, userId: string): Promise<Membership | null> {
    try {
      const { Item } = await this.docClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(boardId), SK: this.sk(userId) },
      }));
      return Item as Membership | null;
    } catch (error: any) {
      this.logger.error('Error getting member:', error);
      return null;
    }
  }
}
