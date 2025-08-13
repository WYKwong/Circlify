# Circlify – Distributed 4-Layer Architecture

This document provides a high-level overview of the Circlify project architecture and structure. Detailed designs (data model, API surface, domain flows, and auth) have been moved into focused documents under `description/`.

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

### Key Components (high-level)
- Dashboard and Account Center
- `BoardCard` and `PermissionSelector`
- Authentication views (signup, confirm, login)

### Technical Implementation
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS for responsive design
- **HTTP Client**: Axios with automatic JWT cookie handling
- **State Management**: React hooks (useState, useEffect) with local component state
- **Authentication**: HTTP-only cookies with JWT tokens
- **UI Components**: Modular, reusable components with conditional rendering

---

## 2. API Gateway Layer - AWS HTTP API
- Serverless HTTP API forwards all routes to the NestJS Lambda handler.
- For the complete REST surface and controller mapping, see: `description/backend-apis.md`.

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

For the complete REST surface, see: `description/backend-apis.md`.

### Security Implementation
- **JWT Strategy**: Custom JWT validation using `@nestjs/passport`
- **Route Guards**: `@UseGuards(JwtAuthGuard)` for protected endpoints
- **Session Management**: HTTP-only cookies with secure flags
- **Input Validation**: DTO-based request validation
- **Permission-based Authorization**: Role and permission-based access control

### Modular Services Architecture

Circlify supports modular, board-level services that can be selectively enabled and configured per board.

- Service Catalog (`AvailableServices`):
  - Global list of optional features (e.g., `approveJoin`).
  - Backed by DynamoDB entries keyed by `PK=SERVICETYPE#<serviceType>`, `SK=META`.
  - Public listing via `GET /services` for board creation UI.

- Enabling a Service for a Board:
  - Boards maintain `enabledServices: string[]` on their metadata (`Boards` table).
  - Owner enables or updates a service via `PUT /boards/:id/services/:serviceKey`.
  - Per-board settings are stored in `BoardServiceSettings` with `PK=BOARD#<boardId>` and `SK=SERVICE#<serviceId>`; fields include `serviceType`, `isDefault`, `config`.
  - GSIs support listing and reverse lookup:
    - `GSI1`: `GSI1PK=BOARD#<boardId>`, `GSI1SK=SERVICETYPE#<serviceType>#<serviceId>`
    - `GSI2`: `GSI2PK=SERVICE#<serviceId>`, `GSI2SK=BOARD#<boardId>`
  - Disabling via `DELETE /boards/:id/services/:serviceKey` cascades cleanup (singleton deletes one item; multi-instance deletes all items of that type). For `approveJoin`, deletes pending join requests.

- Per-service Permissions for Managers:
  - Owners can grant granular capabilities to managers using `BoardServicePermissions` (keyed by `PK=BOARD#<boardId>#SERVICE#<serviceId>`, `SK=USER#<userId>`).
  - Endpoints: grant `PUT /boards/:id/services/:serviceId/permissions/:userId`, revoke `DELETE ...`, list `GET .../permissions`, self-check `GET .../permissions/me`.
  - Owners are implicitly allowed; members are denied; managers must be explicitly granted per service.

- Existing Service – `approveJoin`:
  - Adds a join-request workflow with optional question and TTL.
  - Users either join directly or submit a request (`POST /boards/:id/request`), which can be listed/approved/rejected by the owner.
  - See detailed design and flow: `description/services-modular.md`.

---

## 4. Data Access Layer - AWS Services
See the full DynamoDB schema and indexes: `description/dynamodb-tables.md`.

---

## Detailed Design Docs
- Data model: `description/dynamodb-tables.md`
- REST APIs: `description/backend-apis.md`
- Board domain design: `description/board-domain.md`
- Authentication & sessions: `description/auth-cognito-jwt.md`

---

## Feature Implementation Details
Detailed domain flows have moved to: `description/board-domain.md`.

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
See detailed notes in each focused doc under `description/`.

---

