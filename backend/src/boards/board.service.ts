import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { BoardMembershipService } from './membership.service';

export interface Board {
  PK: string;
  SK: string;
  boardId: string;
  boardName: string;
  ownerId: string;
  enabledServices?: string[];
  createdAt?: string;
}

@Injectable()
export class BoardService {
  private readonly logger = new Logger(BoardService.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly membershipService: BoardMembershipService,
  ) {
    const region = this.configService.get<string>('AWS_REGION');
    if (!region) {
      throw new Error('AWS_REGION is not set');
    }

    const tbl =
      this.configService.get<string>('TABLES.BOARDS_TABLE') ||
      this.configService.get<string>('BOARDS_TABLE');
    if (!tbl) {
      throw new Error('BOARDS_TABLE is not set in environment variables');
    }
    this.tableName = tbl;

    const ddbClient = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(ddbClient);
  }

  private pk(boardId: string) {
    return `BOARD#${boardId}`;
  }

  private OWNER_INDEX = 'ownerId-index';
  public findById(boardId: string) {
    return this.docClient
      .send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(boardId), SK: 'META' },
        }),
      )
      .then((r) => r.Item as Board | undefined);
  }

  private BOARD_NAME_INDEX = 'boardName-index';

  /** Return a board with given name (unique constraint). */
  async findByName(boardName: string): Promise<Board | undefined> {
    try {
      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.BOARD_NAME_INDEX,
          KeyConditionExpression: 'boardName = :n',
          ExpressionAttributeValues: { ':n': boardName },
          Limit: 1,
        }),
      )) as { Items?: Board[] };
      return res.Items?.[0];
    } catch (error) {
      const msg = (error as Error)?.message || '';
      if (msg.includes('specified index')) {
        // fallback to scan when GSI absent (dev)
        this.logger.warn('GSI boardName-index not found, falling back to Scan');
        const res = (await this.docClient.send(
          new ScanCommand({
            TableName: this.tableName,
            FilterExpression: '#n = :n and begins_with(PK, :prefix)',
            ExpressionAttributeNames: { '#n': 'boardName' },
            ExpressionAttributeValues: { ':n': boardName, ':prefix': 'BOARD#' },
            Limit: 1,
          }),
        )) as { Items?: Board[] };
        return res.Items?.[0];
      }
      this.logger.error('Error querying board by name', error as Error);
      throw error;
    }
  }

  /** Fetch boards for a specific owner. */
  async findByOwner(ownerId: string): Promise<Board[]> {
    try {
      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.OWNER_INDEX,
          KeyConditionExpression: 'ownerId = :o',
          ExpressionAttributeValues: { ':o': ownerId },
        }),
      )) as { Items?: Board[] };
      return res.Items ?? [];
    } catch (error) {
      const msg = (error as Error)?.message || '';
      if (msg.includes('specified index')) {
        this.logger.warn('GSI ownerId-index not found, falling back to Scan');
        const res = (await this.docClient.send(
          new ScanCommand({
            TableName: this.tableName,
            FilterExpression: 'ownerId = :o and begins_with(PK, :prefix)',
            ExpressionAttributeValues: { ':o': ownerId, ':prefix': 'BOARD#' },
          }),
        )) as { Items?: Board[] };
        return res.Items ?? [];
      }
      this.logger.error('Error querying boards by owner', error as Error);
      throw error;
    }
  }

  /** List all boards (MVP – expensive scan). */
  async listAll(): Promise<Board[]> {
    try {
      const res = (await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'begins_with(PK, :prefix)',
          ExpressionAttributeValues: { ':prefix': 'BOARD#' },
        }),
      )) as { Items?: Board[] };
      return res.Items ?? [];
    } catch (error) {
      this.logger.error('Error scanning all boards', error as Error);
      throw error;
    }
  }

  /** Create a board if name not duplicated. */
  async create(
    boardName: string,
    ownerId: string,
    opts?: {
      enabledServices?: string[];
    },
  ): Promise<Board> {
    // Ensure unique board name
    const duplicate = await this.findByName(boardName);
    if (duplicate) {
      throw new Error('BOARD_NAME_EXISTS');
    }

    const boardId = randomUUID();
    const board: Board = {
      PK: this.pk(boardId),
      SK: 'META',
      boardId,
      boardName,
      ownerId,
      enabledServices: opts?.enabledServices ?? [],
      createdAt: new Date().toISOString(),
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: board,
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      // auto-add owner membership
      await this.membershipService.addMember(boardId, ownerId, 'owner');
      return board;
    } catch (error) {
      this.logger.error('Error creating board', error as Error);
      throw error;
    }
  }

  async updateBoard(
    boardId: string,
    updates: {
      boardName?: string;
      enabledServices?: string[];
    },
  ): Promise<Board> {
    try {
      // Check if boardName is being updated and if it already exists
      if (updates.boardName) {
        const existingBoard = await this.findByName(updates.boardName.trim());
        if (existingBoard && existingBoard.boardId !== boardId) {
          throw new Error('BOARD_NAME_EXISTS');
        }
      }

      // Build update expression
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (updates.boardName !== undefined) {
        updateExpressions.push('#boardName = :boardName');
        expressionAttributeNames['#boardName'] = 'boardName';
        expressionAttributeValues[':boardName'] = updates.boardName.trim();
      }

      // no service-specific fields on Board anymore

      if (updates.enabledServices !== undefined) {
        updateExpressions.push('#enabledServices = :enabledServices');
        expressionAttributeNames['#enabledServices'] = 'enabledServices';
        expressionAttributeValues[':enabledServices'] = updates.enabledServices;
      }

      if (updateExpressions.length === 0) {
        // No updates provided, just return the existing board
        const existingBoard = await this.findById(boardId);
        if (!existingBoard) {
          throw new Error('Board not found');
        }
        return existingBoard;
      }

      const { Attributes } = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(boardId), SK: 'META' },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        }),
      );

      return Attributes as Board;
    } catch (error) {
      this.logger.error('Error updating board', error as Error);
      throw error;
    }
  }
}
