import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export interface AvailableService {
  PK: string; // SERVICE#<serviceId>
  SK: string; // META
  serviceId: string; // e.g., approveJoin
  displayName: string;
  description?: string;
  haveQuestion?: boolean;
  question?: string;
}

@Injectable()
export class AvailableServicesService {
  private readonly logger = new Logger(AvailableServicesService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    if (!region) throw new Error('AWS_REGION is not set');
    const tbl = this.configService.get<string>('TABLES.AVAILABLE_SERVICES_TABLE') || this.configService.get<string>('AVAILABLE_SERVICES_TABLE');
    if (!tbl) throw new Error('AVAILABLE_SERVICES_TABLE is not set');
    this.tableName = tbl;
    this.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  private pk(serviceId: string) { return `SERVICE#${serviceId}`; }

  async listAll(): Promise<AvailableService[]> {
    try {
      const res: any = await this.docClient.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'begins_with(PK, :p) AND SK = :s',
        ExpressionAttributeValues: { ':p': 'SERVICE#', ':s': 'META' },
      }));
      return (res.Items || []) as AvailableService[];
    } catch (error) {
      this.logger.error('Failed to list available services', error as Error);
      throw error;
    }
  }

  async getById(serviceId: string): Promise<AvailableService | undefined> {
    const { Item } = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { PK: this.pk(serviceId), SK: 'META' },
    }));
    return Item as AvailableService | undefined;
  }

  // Helper to seed a service during development
  async put(service: AvailableService): Promise<void> {
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: service }));
  }
}


