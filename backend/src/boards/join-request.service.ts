import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';

export interface JoinRequest {
  PK: string; // BOARD#id
  SK: string; // REQUEST#userId
  boardId: string;
  userId: string;
  answer?: string;
  expiresAt: number; // epoch seconds
  createdAt: string;
}

@Injectable()
export class BoardJoinRequestService {
  private readonly logger = new Logger(BoardJoinRequestService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(config: ConfigService) {
    const region = config.get<string>('AWS_REGION');
    const tbl =
      config.get<string>('TABLES.BOARD_JOIN_REQUESTS_TABLE') ||
      config.get<string>('BOARD_JOIN_REQUESTS_TABLE');
    if (!region || !tbl) throw new Error('Missing env');
    this.tableName = tbl;
    this.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  private pk(boardId: string) {
    return `BOARD#${boardId}`;
  }

  private sk(userId: string) {
    return `REQUEST#${userId}`;
  }

  async hasPending(boardId: string, userId: string): Promise<boolean> {
    const { Item } = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(boardId), SK: this.sk(userId) },
      }),
    );
    return !!Item;
  }

  async addRequest(
    boardId: string,
    userId: string,
    answer: string | undefined,
    ttlDays: number,
  ): Promise<void> {
    if (await this.hasPending(boardId, userId)) throw new Error('PENDING');
    const now = Date.now();
    const expiresAt = Math.floor(now / 1000) + ttlDays * 24 * 3600;
    const item: JoinRequest = {
      PK: this.pk(boardId),
      SK: this.sk(userId),
      boardId,
      userId,
      answer,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    };
    await this.docClient.send(
      new PutCommand({ TableName: this.tableName, Item: item }),
    );
  }

  async listRequests(boardId: string): Promise<JoinRequest[]> {
    const res = (await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :p',
        ExpressionAttributeValues: { ':p': this.pk(boardId) },
      }),
    )) as { Items?: JoinRequest[] };
    return res.Items || [];
  }

  async deleteAllForBoard(boardId: string): Promise<void> {
    const items = await this.listRequests(boardId);
    for (const item of items) {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(boardId), SK: this.sk(item.userId) },
        }),
      );
    }
  }

  async approve(boardId: string, userId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(boardId), SK: this.sk(userId) },
      }),
    );
  }

  async reject(boardId: string, userId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(boardId), SK: this.sk(userId) },
      }),
    );
  }
}


