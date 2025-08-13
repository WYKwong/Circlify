import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

export interface BoardServiceSetting<TConfig = any> {
  PK: string; // BOARD#<boardId>
  SK: string; // SERVICE#<serviceId>
  boardId: string;
  serviceId: string;
  serviceType: string;
  isDefault: boolean;
  // GSIs to support new query patterns
  GSI1PK: string; // BOARD#<boardId>
  GSI1SK: string; // SERVICETYPE#<serviceType>#<serviceId>
  GSI2PK: string; // SERVICE#<serviceId>
  GSI2SK: string; // BOARD#<boardId>
  config: TConfig;
}

@Injectable()
export class BoardServiceSettingsService {
  private readonly logger = new Logger(BoardServiceSettingsService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    if (!region) throw new Error('AWS_REGION is not set');
    const tbl = this.configService.get<string>('TABLES.BOARD_SERVICE_SETTINGS_TABLE') || this.configService.get<string>('BOARD_SERVICE_SETTINGS_TABLE');
    if (!tbl) throw new Error('BOARD_SERVICE_SETTINGS_TABLE is not set');
    this.tableName = tbl;
    this.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  private pk(boardId: string) { return `BOARD#${boardId}`; }
  private sk(serviceId: string) { return `SERVICE#${serviceId}`; }
  private gsi1pk(boardId: string) { return `BOARD#${boardId}`; }
  private gsi1sk(serviceType: string, serviceId: string) { return `SERVICETYPE#${serviceType}#${serviceId}`; }
  private gsi2pk(serviceId: string) { return `SERVICE#${serviceId}`; }
  private gsi2sk(boardId: string) { return `BOARD#${boardId}`; }

  /**
   * Create or replace a service setting. For singleton services (e.g., approveJoin),
   * serviceId defaults to serviceType and isDefault=true for backward compatibility.
   */
  async put<TConfig = any>(boardId: string, serviceType: string, config: TConfig, serviceId?: string, isDefault?: boolean): Promise<void> {
    const SINGLETON_SERVICE_TYPES = new Set(['approveJoin']);
    let sid = serviceId;
    let defaultFlag = isDefault;
    const isSingleton = SINGLETON_SERVICE_TYPES.has(serviceType);
    if (!sid) {
      sid = isSingleton ? serviceType : `${serviceType}-${randomUUID().slice(0, 8)}`;
    }
    if (typeof defaultFlag !== 'boolean') {
      defaultFlag = isSingleton ? true : false;
    }
    const item: BoardServiceSetting<TConfig> = {
      PK: this.pk(boardId),
      SK: this.sk(sid),
      boardId,
      serviceId: sid,
      serviceType,
      isDefault: defaultFlag,
      GSI1PK: this.gsi1pk(boardId),
      GSI1SK: this.gsi1sk(serviceType, sid),
      GSI2PK: this.gsi2pk(sid),
      GSI2SK: this.gsi2sk(boardId),
      config,
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
    // Clean up legacy record if it exists (pre-migration SK = SERVICETYPE#<serviceType>)
    const legacySk = `SERVICETYPE#${serviceType}`;
    try {
      await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId), SK: legacySk } }));
    } catch { /* ignore */ }
  }

  /**
   * Backward-compatible getter for singleton services by serviceType.
   * Uses SK of SERVICE#<serviceType> assuming singleton id equals type.
   */
  async get<TConfig = any>(boardId: string, serviceType: string): Promise<BoardServiceSetting<TConfig> | undefined> {
    // New key: SK = SERVICE#<serviceId>; for singleton, serviceId = serviceType
    const { Item } = await this.docClient.send(new GetCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId), SK: this.sk(serviceType) } }));
    if (Item) return Item as BoardServiceSetting<TConfig>;
    // Backward compatibility: legacy key used SK = SERVICETYPE#<serviceType>
    const legacySk = `SERVICETYPE#${serviceType}`;
    const { Item: Legacy } = await this.docClient.send(new GetCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId), SK: legacySk } }));
    return Legacy as BoardServiceSetting<TConfig> | undefined;
  }

  async list(boardId: string): Promise<BoardServiceSetting[]> {
    const res = (await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :p',
      ExpressionAttributeValues: { ':p': this.pk(boardId) },
    }))) as { Items?: BoardServiceSetting[] };
    return res.Items ?? [];
  }

  /** Delete singleton service settings by serviceType (SK uses serviceId=serviceType). */
  async delete(boardId: string, serviceType: string): Promise<void> {
    await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId), SK: this.sk(serviceType) } }));
    // Also attempt to remove legacy record
    const legacySk = `SERVICETYPE#${serviceType}`;
    try {
      await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId), SK: legacySk } }));
    } catch { /* ignore */ }
  }

  /** List services of a board filtered by serviceType using GSI1 when available. */
  async listByType(boardId: string, serviceType: string): Promise<BoardServiceSetting[]> {
    try {
      const res = (await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :p AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: { ':p': this.gsi1pk(boardId), ':sk': `SERVICETYPE#${serviceType}#` },
      }))) as { Items?: BoardServiceSetting[] };
      return res.Items ?? [];
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('specified index') || msg.includes('cannot do operations on a non-existent table or index')) {
        // Fallback: query by PK and filter in memory
        const all = await this.list(boardId);
        return all.filter(i => i.serviceType === serviceType);
      }
      throw error;
    }
  }

  /** Find a service setting by its serviceId using GSI2; fallback to Scan on missing index. */
  async getByServiceId<TConfig = any>(serviceId: string): Promise<BoardServiceSetting<TConfig> | undefined> {
    try {
      const res = (await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :p',
        ExpressionAttributeValues: { ':p': this.gsi2pk(serviceId) },
        Limit: 1,
      }))) as { Items?: BoardServiceSetting<TConfig>[] };
      return (res.Items && res.Items[0]) as BoardServiceSetting<TConfig> | undefined;
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('specified index') || msg.includes('cannot do operations on a non-existent table or index')) {
        // Fallback: Scan by GSI2PK equality (less efficient but OK for dev)
        const res: any = await this.docClient.send(new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'GSI2PK = :p',
          ExpressionAttributeValues: { ':p': this.gsi2pk(serviceId) },
          Limit: 1,
        }));
        const items = res.Items as BoardServiceSetting<TConfig>[] | undefined;
        return items && items[0];
      }
      throw error;
    }
  }
}


