import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

export interface BoardServiceSetting<TConfig = any> {
  PK: string; // BOARD#<boardId>
  SK: string; // SERVICE#<serviceKey>
  boardId: string;
  serviceKey: string;
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
  private sk(serviceKey: string) { return `SERVICE#${serviceKey}`; }

  async put<TConfig = any>(boardId: string, serviceKey: string, config: TConfig): Promise<void> {
    const item: BoardServiceSetting<TConfig> = {
      PK: this.pk(boardId),
      SK: this.sk(serviceKey),
      boardId,
      serviceKey,
      config,
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  async get<TConfig = any>(boardId: string, serviceKey: string): Promise<BoardServiceSetting<TConfig> | undefined> {
    const { Item } = await this.docClient.send(new GetCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId), SK: this.sk(serviceKey) } }));
    return Item as BoardServiceSetting<TConfig> | undefined;
  }

  async list(boardId: string): Promise<BoardServiceSetting[]> {
    const res = (await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :p',
      ExpressionAttributeValues: { ':p': this.pk(boardId) },
    }))) as { Items?: BoardServiceSetting[] };
    return res.Items ?? [];
  }

  async delete(boardId: string, serviceKey: string): Promise<void> {
    await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { PK: this.pk(boardId), SK: this.sk(serviceKey) } }));
  }
}


