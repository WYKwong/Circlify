import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { BoardServiceSettingsService } from './service-settings.service';

export interface ServicePermission {
  PK: string; // BOARD#<boardId>#SERVICE#<serviceId>
  SK: string; // USER#<userId>
  boardId: string;
  userId: string;
  serviceId: string;
  grantedAt: string;
  grantedBy?: string;
}

@Injectable()
export class BoardServicePermissionsService {
  private readonly logger = new Logger(BoardServicePermissionsService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService, private readonly settingsService: BoardServiceSettingsService) {
    const region = this.configService.get<string>('AWS_REGION');
    const tbl = this.configService.get<string>('TABLES.BOARD_SERVICE_PERMISSIONS_TABLE') || this.configService.get<string>('BOARD_SERVICE_PERMISSIONS_TABLE');
    if (!region || !tbl) throw new Error('BOARD_SERVICE_PERMISSIONS_TABLE not set');
    this.tableName = tbl;
    this.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  private pk(boardId: string, serviceId: string) { return `BOARD#${boardId}#SERVICE#${serviceId}`; }
  private sk(userId: string) { return `USER#${userId}`; }

  async grant(boardId: string, userId: string, serviceId: string, grantedBy?: string): Promise<void> {
    const item: ServicePermission = {
      PK: this.pk(boardId, serviceId),
      SK: this.sk(userId),
      boardId,
      userId,
      serviceId,
      grantedAt: new Date().toISOString(),
      grantedBy,
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  async revoke(boardId: string, userId: string, serviceId: string): Promise<void> {
    await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId, serviceId), SK: this.sk(userId) } }));
    // Backward-compat: attempt legacy delete by serviceType if present
    try {
      const setting = await this.settingsService.getByServiceId(serviceId);
      const legacyPk = `BOARD#${boardId}#SERVICE#${setting?.serviceType}`;
      if (setting?.serviceType) {
        await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { PK: legacyPk, SK: this.sk(userId) } }));
      }
    } catch {}
  }

  async has(boardId: string, userId: string, serviceId: string): Promise<boolean> {
    const { Item } = await this.docClient.send(new GetCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId, serviceId), SK: this.sk(userId) } }));
    if (Item) return true;
    // Backward-compat: check legacy key by serviceType if available
    try {
      const setting = await this.settingsService.getByServiceId(serviceId);
      if (!setting?.serviceType) return false;
      const legacyPk = `BOARD#${boardId}#SERVICE#${setting.serviceType}`;
      const { Item: Legacy } = await this.docClient.send(new GetCommand({ TableName: this.tableName, Key: { PK: legacyPk, SK: this.sk(userId) } }));
      return !!Legacy;
    } catch { return false; }
  }

  async listForService(boardId: string, serviceId: string): Promise<ServicePermission[]> {
    const res = (await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :p',
      ExpressionAttributeValues: { ':p': this.pk(boardId, serviceId) },
    }))) as { Items?: ServicePermission[] };
    let items = res.Items || [];
    if (items.length === 0) {
      // Backward-compat: try legacy key by serviceType
      try {
        const setting = await this.settingsService.getByServiceId(serviceId);
        if (setting?.serviceType) {
          const legacyPk = `BOARD#${boardId}#SERVICE#${setting.serviceType}`;
          const legacy = (await this.docClient.send(new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :p',
            ExpressionAttributeValues: { ':p': legacyPk },
          }))) as { Items?: ServicePermission[] };
          items = legacy.Items || [];
        }
      } catch {}
    }
    return items;
  }
}


