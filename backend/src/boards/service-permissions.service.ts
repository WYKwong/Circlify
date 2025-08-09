import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export interface ServicePermission {
  PK: string; // BOARD#<boardId>#SERVICE#<serviceKey>
  SK: string; // USER#<userId>
  boardId: string;
  userId: string;
  serviceKey: string;
  grantedAt: string;
  grantedBy?: string;
}

@Injectable()
export class BoardServicePermissionsService {
  private readonly logger = new Logger(BoardServicePermissionsService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const tbl = this.configService.get<string>('TABLES.BOARD_SERVICE_PERMISSIONS_TABLE') || this.configService.get<string>('BOARD_SERVICE_PERMISSIONS_TABLE');
    if (!region || !tbl) throw new Error('BOARD_SERVICE_PERMISSIONS_TABLE not set');
    this.tableName = tbl;
    this.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  private pk(boardId: string, serviceKey: string) { return `BOARD#${boardId}#SERVICE#${serviceKey}`; }
  private sk(userId: string) { return `USER#${userId}`; }

  async grant(boardId: string, userId: string, serviceKey: string, grantedBy?: string): Promise<void> {
    const item: ServicePermission = {
      PK: this.pk(boardId, serviceKey),
      SK: this.sk(userId),
      boardId,
      userId,
      serviceKey,
      grantedAt: new Date().toISOString(),
      grantedBy,
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  async revoke(boardId: string, userId: string, serviceKey: string): Promise<void> {
    await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId, serviceKey), SK: this.sk(userId) } }));
  }

  async has(boardId: string, userId: string, serviceKey: string): Promise<boolean> {
    const { Item } = await this.docClient.send(new GetCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId, serviceKey), SK: this.sk(userId) } }));
    return !!Item;
  }

  async listForService(boardId: string, serviceKey: string): Promise<ServicePermission[]> {
    const res = (await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :p',
      ExpressionAttributeValues: { ':p': this.pk(boardId, serviceKey) },
    }))) as { Items?: ServicePermission[] };
    return res.Items || [];
  }
}


