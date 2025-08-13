[⬅ Back to README](../README.md)

## DynamoDB Table Design

This document summarizes the DynamoDB schema used by the backend. All tables follow a unified PK/SK pattern for scalability and predictable access paths.

### Naming and Configuration
- Table names are centrally configured in `backend/src/config/tables.config.ts` and loaded via `@nestjs/config` in `AppModule`.
- Code falls back to legacy `*_TABLE` env variables when needed (dev convenience).

### Unified Keys
- Partition Key: `PK`
- Sort Key: `SK`

### Tables

#### UserProfiles
```json
{
  "PK": "USER#<userId>",
  "SK": "PROFILE",
  "userId": "<userId>",
  "email": "user@example.com",
  "userName": "username",
  "createdAt": "2024-12-07T18:28:15.735Z"
}
```

#### Boards
```json
{
  "PK": "BOARD#<boardId>",
  "SK": "META",
  "boardId": "<boardId>",
  "boardName": "Project Board",
  "ownerId": "<userId>",
  "enabledServices": ["approveJoin"],
  "createdAt": "2024-12-07T21:29:54.716Z"
}
```

#### BoardMemberships
```json
{
  "PK": "BOARD#<boardId>",
  "SK": "USER#<userId>",
  "boardId": "<boardId>",
  "userId": "<userId>",
  "role": "member|manager|owner",
  "joinedAt": "2024-12-07T21:29:54.716Z"
}
```

#### BoardJoinRequests
```json
{
  "PK": "BOARD#<boardId>",
  "SK": "REQUEST#<userId>",
  "boardId": "<boardId>",
  "userId": "<userId>",
  "answer": "I want to contribute to the project",
  "expiresAt": 1728000000,
  "createdAt": "2024-12-07T21:29:54.716Z"
}
```

#### AvailableServices
```json
{
  "PK": "SERVICETYPE#approveJoin",
  "SK": "META",
  "serviceType": "approveJoin",
  "displayName": "Need approval to join",
  "description": "allow board to hanld apply request"
}
```

Notes:
- Service catalog entries (e.g., `approveJoin`) must be seeded manually in the `AvailableServices` table during setup.

#### BoardServiceSettings
```json
{
  "PK": "BOARD#<boardId>",
  "SK": "SERVICE#<serviceId>",
  "boardId": "<boardId>",
  "serviceId": "<serviceId>",
  "serviceType": "approveJoin",
  "isDefault": true,
  "GSI1PK": "BOARD#<boardId>",
  "GSI1SK": "SERVICETYPE#<serviceType>#<serviceId>",
  "GSI2PK": "SERVICE#<serviceId>",
  "GSI2SK": "BOARD#<boardId>",
  "config": {
    "ttlDays": 3,
    "askQuestion": true,
    "questionText": "Why do you want to join?"
  }
}
```

#### BoardServicePermissions
```json
{
  "PK": "BOARD#<boardId>#SERVICE#<serviceId>",
  "SK": "USER#<userId>",
  "boardId": "<boardId>",
  "userId": "<userId>",
  "serviceId": "<serviceId>",
  "grantedAt": "2025-08-08T10:00:00Z",
  "grantedBy": "<ownerUserId>"
}
```

### Global Secondary Indexes (GSIs)

- `userName-index` on `UserProfiles` for username uniqueness and lookup
- `ownerId-index` on `Boards` to query by owner
- `boardName-index` on `Boards` for unique name check
- `userId-index` on `BoardMemberships` and `BoardJoinRequests` to list user-related items
- `GSI1` on `BoardServiceSettings` for per-board service enumeration
  - `GSI1PK = BOARD#<boardId>`
  - `GSI1SK = SERVICETYPE#<serviceType>#<serviceId>`
  - Use cases:
    - List all services of a board: `GSI1PK = BOARD#X`, `begins_with(GSI1SK, 'SERVICETYPE#')`
    - List a specific type (e.g., `trades`): `begins_with(GSI1SK, 'SERVICETYPE#trades')`
- `GSI2` on `BoardServiceSettings` for direct lookup by `serviceId`
  - `GSI2PK = SERVICE#<serviceId>`
  - `GSI2SK = BOARD#<boardId>`
  - Use case: given a `serviceId`, find its owning board and config in O(1)

Implementation notes:
- Services attempt GSI queries first and fall back to `Scan` or primary key queries in development if GSIs are missing.
- Join request records include `expiresAt` (epoch seconds) to leverage DynamoDB TTL for auto-cleanup.


