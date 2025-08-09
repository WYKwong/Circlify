# Circlify – Distributed 4-Layer Architecture

> **Version:** MVP ‑ December 2024

This document provides a comprehensive overview of the Circlify project, detailing the distributed 4-layer architecture, service components, database design, and current feature implementation.

## Architecture Overview

Circlify follows a **4-layer distributed architecture** that separates concerns between user interface, API ingress, backend microservices, and data access layers.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐    ┌───────────────────┐
│   Frontend      │───▶│  API Gateway    │───▶│  Backend Services   │───▶│  Data Access      │
│   (Next.js)     │    │ (AWS HTTP API)  │    │  (Nest.js Lambda)   │    │  & External      │
│                 │    │                 │    │                     │    │  Stores           │
└─────────────────┘    └─────────────────┘    └─────────────────────┘    └───────────────────┘
        ① HTML/CSS/JS        ② HTTPS/REST           ③ Internal Calls          ④ SDK/DynamoDB
```

*Numbers ①-④ correspond to the detailed sections below.*

---

## 1. Frontend Layer (UI) - Next.js Application

### Project Structure
```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Landing page
│   │   ├── login/page.tsx     # Sign-in form
│   │   ├── signup/page.tsx    # Registration form
│   │   ├── confirm/page.tsx   # Email confirmation
│   │   ├── username/page.tsx  # Username setup
│   │   ├── dashboard/page.tsx # Main dashboard (all boards)
│   │   └── account/page.tsx   # Account center (my boards)
│   ├── components/             # Reusable UI components
│   │   ├── BoardCard.tsx      # Board display and management
│   │   └── PermissionSelector.tsx # Permission management UI
│   ├── lib/
│   │   └── api.ts             # Axios configuration
│   └── globals.css            # Tailwind CSS styles
├── public/                    # Static assets
└── package.json
```

### Key Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **Dashboard** | Main board discovery | • Display all boards in grid layout<br>• Join boards (direct or with approval)<br>• Authentication status display<br>• Dynamic join button states |
| **Account Center** | User management | • Username editing<br>• Board creation with approval settings<br>• Member role management<br>• Join request approval<br>• Permission management |
| **BoardCard** | Board management UI | • Square card layout (64x64)<br>• Role-based content display<br>• Member search and role updates<br>• Permission management<br>• Join request handling |
| **PermissionSelector** | Permission management | • Multi-select permission checkboxes<br>• Role assignment with permissions<br>• Permission modification for existing managers |
| **Authentication** | User registration/login | • Email/password signup<br>• Email confirmation flow<br>• JWT-based session management |

### Technical Implementation
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS for responsive design
- **HTTP Client**: Axios with automatic JWT cookie handling
- **State Management**: React hooks (useState, useEffect) with local component state
- **Authentication**: HTTP-only cookies with JWT tokens
- **UI Components**: Modular, reusable components with conditional rendering

---

## 2. API Gateway Layer - AWS HTTP API

### Configuration
```yaml
# backend/serverless.yml
functions:
  api:
    handler: dist/main.handler
    events:
      - httpApi:
          routes:
            # Authentication
            - POST /auth/cognito/login
            - POST /auth/cognito/signup
            - POST /confirm
            - GET /profile
            - POST /profile/username
            - GET /profile/username-exists
            
            # Board Management
            - GET /boards
            - POST /boards
            - GET /boards/my
            - PUT /boards/{id}
            - GET /boards/{id}/permissions
            
            # Membership Management
            - POST /boards/{id}/join
            - GET /boards/my-memberships
            - GET /boards/my-memberships-detailed
            - GET /boards/{id}/members/{role}
            - PUT /boards/{id}/members/{userId}/role
            - GET /boards/{id}/members/{userId}/permissions
            - GET /boards/{id}/members/search/{username}
            
            # Join Requests
            - POST /boards/{id}/request
            - GET /boards/{id}/requests
            - POST /boards/{id}/requests/{userId}/approve
            - POST /boards/{id}/requests/{userId}/reject
            
            - /{proxy+}  # Catch-all for other routes
```

### Key Features
- **HTTPS Termination**: Automatic SSL certificate management
- **Request Routing**: Path-based routing to Lambda functions
- **CORS Support**: Cross-origin resource sharing configuration
- **Authentication**: JWT validation at gateway level
- **Rate Limiting**: Built-in request throttling

---

## 3. Backend Microservices Layer - Nest.js on AWS Lambda

### Project Structure
```
backend/
├── src/
│   ├── auth/                   # Authentication & User Management
│   │   ├── auth.controller.ts  # Auth endpoints
│   │   ├── auth.service.ts     # Business logic
│   │   ├── cognito.service.ts  # AWS Cognito integration
│   │   ├── user-profile.service.ts # DynamoDB user profiles
│   │   ├── jwt.strategy.ts     # JWT validation
│   │   └── jwt-auth.guard.ts   # Route protection
│   ├── boards/                 # Board Management System
│   │   ├── board.service.ts    # Board CRUD operations
│   │   ├── board.controller.ts # Board REST endpoints
│   │   ├── membership.service.ts # Member role management
│   │   ├── membership.controller.ts # Membership endpoints
│   │   ├── join-request.service.ts # Join request handling
│   │   ├── join-request.controller.ts # Request endpoints
│   │   └── board.module.ts     # Module configuration
│   ├── app.module.ts           # Root module
│   └── main.ts                 # Lambda bootstrap
├── serverless.yml              # AWS deployment config
└── package.json
```

### Service Architecture

#### Authentication Services
| Service | Responsibility | Key Methods |
|---------|---------------|-------------|
| **AuthService** | User registration/login | • `signUp(email, password)`<br>• `signIn(email, password)`<br>• `confirmSignUp(email, code)` |
| **CognitoService** | AWS Cognito integration | • `createUser(email, password)`<br>• `authenticateUser(email, password)`<br>• `confirmUser(email, code)` |
| **UserProfileService** | User profile management | • `create(userId, email)`<br>• `findById(userId)`<br>• `updateUserName(userId, userName)`<br>• `findByUserName(userName)` |

#### Board Management Services
| Service | Responsibility | Key Methods |
|---------|---------------|-------------|
| **BoardService** | Board CRUD operations | • `create(boardData)`<br>• `findById(boardId)`<br>• `findByName(boardName)`<br>• `findByOwner(ownerId)`<br>• `listAll()`<br>• `updateBoard(boardId, updates)` |
| **BoardMembershipService** | Member role management | • `addMember(boardId, userId, role, permissions?)`<br>• `updateRole(boardId, userId, role, permissions?)`<br>• `listByRole(boardId, role)`<br>• `isMember(boardId, userId)`<br>• `listMembershipsForUser(userId)`<br>• `getMember(boardId, userId)` |
| **BoardJoinRequestService** | Join request handling | • `addRequest(boardId, userId, answer, ttlDays)`<br>• `listRequests(boardId)`<br>• `approveRequest(boardId, userId)`<br>• `rejectRequest(boardId, userId)`<br>• `hasPending(boardId, userId)` |

### Controller Endpoints

#### Authentication Endpoints
```
POST /auth/cognito/signup     # User registration
POST /auth/cognito/login      # User authentication
POST /confirm                 # Email confirmation
GET  /profile                 # Get user profile
POST /profile/username        # Update username
GET  /profile/username-exists # Check username availability
```

#### Board Management Endpoints
```
GET  /boards                  # List all boards
POST /boards                  # Create new board
GET  /boards/my              # Get user's owned/managed boards
PUT  /boards/{id}            # Update board settings
GET  /boards/{id}/permissions # Get available board permissions
GET  /services               # List AvailableServices (catalog)
GET  /boards/{id}/services            # List service settings for the board
GET  /boards/{id}/services/{key}      # Get a specific service setting
PUT  /boards/{id}/services/{serviceKey}    # Enable or update a service
DELETE /boards/{id}/services/{serviceKey}  # Disable a service (with cascade)
```

#### Member Management Endpoints
```
POST /boards/{id}/join       # Join board (direct or request)
GET  /boards/my-memberships  # Get user's board memberships
GET  /boards/my-memberships-detailed # Get detailed memberships
GET  /boards/{id}/members/{role}           # List members by role
PUT  /boards/{id}/members/{userId}/role    # Update member role
GET  /boards/{id}/members/{userId}/permissions # Deprecated: returns []
GET  /boards/{id}/members/search/{username} # Search member by username
```

#### Service Permissions Endpoints
```
PUT    /boards/{id}/services/{serviceKey}/permissions/{userId}   # Grant permission (owner-only)
DELETE /boards/{id}/services/{serviceKey}/permissions/{userId}   # Revoke permission (owner-only)
GET    /boards/{id}/services/{serviceKey}/permissions            # List service permissions (owner-only)
GET    /boards/{id}/services/{serviceKey}/permissions/me         # Check current user's permission
```

#### Join Request Endpoints
```
POST /boards/{id}/request                   # Submit join request
GET  /boards/{id}/requests                  # List pending requests
POST /boards/{id}/requests/{userId}/approve # Approve request
POST /boards/{id}/requests/{userId}/reject  # Reject request
```

### Security Implementation
- **JWT Strategy**: Custom JWT validation using `@nestjs/passport`
- **Route Guards**: `@UseGuards(JwtAuthGuard)` for protected endpoints
- **Session Management**: HTTP-only cookies with secure flags
- **Input Validation**: DTO-based request validation
- **Permission-based Authorization**: Role and permission-based access control

---

## 4. Data Access Layer - AWS Services

### Database Design - Unified PK/SK Architecture

All DynamoDB tables follow a unified **Partition Key (PK) / Sort Key (SK)** design pattern for scalability and efficient querying.

Current tables (7):
- AvailableServices – PK: `SERVICE#<serviceId>`, SK: `META`
- BoardServiceSettings – PK: `BOARD#<boardId>`, SK: `SERVICE#<serviceKey>`
- BoardServicePermissions – PK: `BOARD#<boardId>#SERVICE#<serviceKey>`, SK: `USER#<userId>`
- Boards – PK: `BOARD#<boardId>`, SK: `META`
- BoardMemberships – PK: `BOARD#<boardId>`, SK: `USER#<userId>`
- BoardJoinRequests – PK: `BOARD#<boardId>`, SK: `REQUEST#<userId>`
- UserProfiles – PK: `USER#<userId>`, SK: `PROFILE`

#### Table: UserProfiles
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

#### Table: Boards
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

#### Table: BoardMemberships
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

#### Table: BoardJoinRequests
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

#### Table: AvailableServices
```json
{
  "PK": "SERVICE#approveJoin",
  "SK": "META",
  "serviceId": "approveJoin",
  "displayName": "Need approval to join",
  "description": "支持板块的申请处理"
}
```

Notes:
- These service catalog entries must be seeded/created manually in the `AvailableServices` table (no automatic provisioning).
- Currently available services: `approveJoin`.

#### Table: BoardServiceSettings
```json
{
  "PK": "BOARD#<boardId>",
  "SK": "SERVICE#<serviceKey>",
  "boardId": "<boardId>",
  "serviceKey": "approveJoin",
  "config": {
    "ttlDays": 3, // (range:1-5, unit: day)
    "askQuestion": true,
    "questionText": "Why do you want to join?"
  }
}
```

#### Table: BoardServicePermissions
```json
{
  "PK": "BOARD#<boardId>#SERVICE#<serviceKey>",
  "SK": "USER#<userId>",
  "boardId": "<boardId>",
  "userId": "<userId>",
  "serviceKey": "approveJoin",
  "grantedAt": "2025-08-08T10:00:00Z",
  "grantedBy": "<ownerUserId>"
}
```

### Global Secondary Indexes (GSIs)

| Index Name | Partition Key | Sort Key | Purpose |
|------------|---------------|----------|---------|
| `userName-index` | `userName` | - | Username uniqueness and lookup |
| `ownerId-index` | `ownerId` | - | Query boards by owner |
| `boardName-index` | `boardName` | - | Board name uniqueness |
| `userId-index` | `userId` | - | List user's memberships and requests |

### AWS Services Integration

#### Amazon Cognito
- **User Pool**: Managed user authentication
- **App Client**: OAuth 2.0 client configuration
- **Functions**: Sign-up, sign-in, password reset
- **Integration**: `@aws-sdk/client-cognito-identity-provider`

#### Amazon DynamoDB
- **Tables**: UserProfiles, Boards, BoardMemberships, BoardJoinRequests, AvailableServices, BoardServiceSettings, BoardServicePermissions
- **Document Client**: `@aws-sdk/lib-dynamodb` for type-safe operations
- **TTL**: Automatic cleanup for join requests
- **GSI**: Efficient querying on non-primary key attributes
- **Fallback Logic**: Scan operations for development environments

---

## Environment Variables

### Backend Configuration
```bash
# AWS
AWS_REGION=us-east-2

# Cognito
COGNITO_USER_POOL_ID=your-user-pool-id
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/your-user-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret
COGNITO_DOMAIN=https://yourdomain.auth.us-east-2.amazoncognito.com
COGNITO_REDIRECT_URI=http://localhost:3000/auth/cognito/callback
COGNITO_LOGOUT_URI=http://localhost:3001

# App
FRONTEND_URL=http://localhost:3001

# Security
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret
```

Table names are centrally configured in code (`backend/src/config/tables.config.ts`) and loaded at startup. Legacy `*_TABLE` environment variables are no longer required.

### Frontend Configuration
```bash
# API Configuration
NEXT_PUBLIC_API_BASE=http://localhost:3000
```

---

## Feature Implementation Details

### Board Creation Flow
1. **Frontend**: User fills board creation form, selects Available Services, and configures per-service options
2. **Validation**: Client-side duplicate name check
3. **Backend**: `BoardService.create()` with approval configuration
4. **Database**: Store board metadata with PK=`BOARD#<boardId>`, SK=`META`
5. **Membership**: Automatically add creator as owner with default permissions
6. **Enabled Services**: Set from form selection; if `approveJoin` selected, optional `joinQuestion` and TTL can be configured. If a question is set, applicants must answer.

### Member Search & Role Management
1. **Search**: Query BoardMemberships by boardId, then UserProfiles by userId
2. **Role Update**: Update membership record with new role（permissions decoupled to BoardServicePermissions）
3. **Authorization**: Only board owners can manage member roles
4. **Real-time**: Immediate UI updates after role changes
5. **Permission Management**: Granular permission assignment for managers

### Join Request Workflow
1. **Request**: User submits join request; if the board has a `joinQuestion`, the answer is mandatory
2. **Storage**: Save to BoardJoinRequests with TTL
3. **Approval**: Owners/managers with `approveJoin` permission review requests（manager permission stored in BoardServicePermissions）
4. **Membership**: Approved requests automatically create membership

### Permission System
1. **Board Enabled Services**: Each board has an `enabledServices` list（feature toggle）
2. **Per-service Permissions**: Manager capabilities are stored in `BoardServicePermissions` per service
3. **Authorization Rule of Thumb**:
   - Owner: always allowed
   - Member: always denied
   - Manager: must have a corresponding entry in `BoardServicePermissions` for the service
4. **UI Control**: Components check `/boards/{id}/services/{key}/permissions/me` for runtime permission
5. **Role Management**: Owners assign role via membership; granular permissions via BoardServicePermissions

---

## Development Setup

### Prerequisites
- Node.js 18+
- AWS CLI configured
- Serverless Framework installed

### Local Development
```bash
# Install dependencies
npm install -w backend -w frontend

# Start backend (port 3000)
cd backend
npm run start:dev

# Start frontend (port 3001)
cd ../frontend
npm run dev
```

### Deployment
```bash
# Deploy backend to AWS
cd backend
serverless deploy

# Build and deploy frontend
cd ../frontend
npm run build
# Deploy to your hosting platform
```

---

## Architecture Benefits

### Scalability
- **Serverless**: Automatic scaling based on demand
- **Microservices**: Independent service scaling
- **Database**: DynamoDB auto-scaling with on-demand capacity
- **GSI**: Efficient querying for complex access patterns

### Security
- **Authentication**: AWS Cognito managed user pools
- **Authorization**: JWT-based route protection with permission-based access
- **Data**: Encrypted at rest and in transit
- **Session Management**: Secure HTTP-only cookies

### Maintainability
- **Separation of Concerns**: Clear layer boundaries
- **Type Safety**: TypeScript throughout the stack
- **Modularity**: Nest.js dependency injection
- **Component Reusability**: Modular frontend components

### Performance
- **CDN**: Static assets served from edge locations
- **Caching**: API Gateway response caching
- **Database**: DynamoDB single-digit millisecond latency
- **GSI Queries**: Optimized data access patterns

---

## Current Features

### Authentication & User Management
- ✅ User registration with email confirmation
- ✅ Secure login with JWT session management
- ✅ Username setup and editing
- ✅ Profile management

### Board Management
- ✅ Board creation with approval settings
- ✅ Board name duplication prevention
- ✅ Board settings management (approval, questions, TTL)
- ✅ Board listing and discovery

### Membership System
- ✅ Direct board joining
- ✅ Join request workflow with approval
- ✅ Role-based access control (member, manager, owner)
- ✅ Member search by username
- ✅ Role promotion and demotion

### Permission System
- ✅ Granular permission management
- ✅ Permission-based UI rendering
- ✅ Manager permission assignment
- ✅ Permission modification for existing managers

### User Interface
- ✅ Responsive dashboard with board grid
- ✅ Account center for user management
- ✅ Modal-based forms for board creation
- ✅ Join request approval interface
- ✅ Permission management UI

---

## Technical Notes

### Error Handling
- **Backend**: Comprehensive error handling with fallback mechanisms
- **Frontend**: User-friendly error messages and validation
- **Database**: GSI fallback for development environments
- **TypeScript**: Strict type checking throughout the application

### Performance Optimizations
- **DynamoDB**: Efficient PK/SK design with GSIs
- **Frontend**: Component-level state management
- **API**: Optimized query patterns and caching
- **Build**: Optimized Next.js builds with tree shaking

### Security Considerations
- **Authentication**: Multi-factor authentication ready
- **Authorization**: Permission-based access control
- **Data Protection**: Encrypted data at rest and in transit
- **Session Security**: Secure cookie configuration

---

