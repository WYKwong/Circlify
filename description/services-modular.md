[⬅ Back to README](../README.md)

## Modular Services: Structure and Operation

This document explains the modular service model in Circlify and provides a deep dive into the implemented `approveJoin` service.

### Goals
- Allow boards to selectively enable features (services) without changing core board schema
- Keep per-service configuration isolated and extensible
- Support granular, per-service manager permissions

### Building Blocks

1) Service Catalog – `AvailableServices`
   - Purpose: Global list of optional features that can be enabled per board
   - Storage: DynamoDB with `PK=SERVICETYPE#<serviceType>`, `SK=META`
   - API: `GET /services` (public) for UI discovery
   - Provisioning: Entries are seeded manually (e.g., `approveJoin`)

2) Enabling on a Board – `Boards.enabledServices`
   - `Boards` item includes an array `enabledServices: string[]`
   - Owner enables/updates a service via `PUT /boards/:id/services/:serviceKey`
   - Disabling via `DELETE /boards/:id/services/:serviceKey` triggers cascade cleanup (see below)

3) Per-board Service Settings – `BoardServiceSettings`
   - Storage: `PK=BOARD#<boardId>`, `SK=SERVICE#<serviceId>`
   - Fields: `boardId`, `serviceId`, `serviceType`, `isDefault`, `config`
   - Indexes:
     - `GSI1`: `GSI1PK=BOARD#<boardId>`, `GSI1SK=SERVICETYPE#<serviceType>#<serviceId>` for listing by board and type
     - `GSI2`: `GSI2PK=SERVICE#<serviceId>`, `GSI2SK=BOARD#<boardId>` for direct lookup by instance id
   - Read APIs: `GET /boards/:id/services`, `GET /boards/:id/services/:key` (compat: `:key` is `serviceType` for singletons)
   - Write API (owner only): `PUT /boards/:id/services/:serviceKey` with optional `{ config }` (singleton defaults `serviceId = serviceKey`)

4) Per-service Manager Permissions – `BoardServicePermissions`
   - Storage: `PK=BOARD#<boardId>#SERVICE#<serviceId>`, `SK=USER#<userId>`
   - APIs (owner only): grant `PUT /boards/:id/services/:serviceId/permissions/:userId`, revoke `DELETE ...`, list `GET .../permissions`
   - Self-check: `GET /boards/:id/services/:serviceId/permissions/me` implements rule: owner → true, member → false, manager → must have explicit record

5) Cascade Cleanup on Disable
   - Removing a service from `enabledServices` via `DELETE /boards/:id/services/:serviceKey` cleans related data:
     - For singleton services: delete the matching `serviceId = serviceType` item in `BoardServiceSettings`
     - For multi-instance services: delete all `BoardServiceSettings` items of that `serviceType` for the board (via `GSI1`), then cascade domain data
     - For `approveJoin`: deletes all pending join requests
     - Optionally, revoke all `BoardServicePermissions` (TBD)

### Request Flow and Authz Rule of Thumb
- Owner: implicitly allowed for all service actions
- Member: denied
- Manager: must be explicitly granted in `BoardServicePermissions`

---

## Service: approveJoin

Purpose: Gate board membership via owner-managed approval with optional question prompt and TTL on requests.

### Config (`BoardServiceSettings`)
```json
{
  "ttlDays": 3,
  "askQuestion": true,
  "questionText": "Why do you want to join?"
}
```

### Data
- Join Requests: `BoardJoinRequests` with keys `PK=BOARD#<boardId>`, `SK=REQUEST#<userId>` and fields `{ answer?, createdAt, expiresAt }`
- TTL: `expiresAt` (epoch seconds) suitable for DynamoDB TTL

### APIs
- Enable/Update (owner): `PUT /boards/:id/services/approveJoin` with optional `{ config }`
- Disable (owner): `DELETE /boards/:id/services/approveJoin` (cascades delete pending requests)
- Submit request (member): `POST /boards/:id/request` with optional `{ answer }`
- List requests (owner): `GET /boards/:id/requests`
- Approve (owner): `POST /boards/:id/requests/:uid/approve` (creates membership + deletes request)
- Reject (owner): `POST /boards/:id/requests/:uid/reject` (deletes request)

### Client Behavior
- If `approveJoin` is not enabled → direct join via `POST /boards/:id/join`
- If enabled and `askQuestion` with non-empty `questionText` → UI requires answer field
- If enabled without a question → system creates a pending request directly

### Internals (Code Pointers)
- Catalog: `backend/src/boards/services.service.ts` (`AvailableServicesService`)
- Settings: `backend/src/boards/service-settings.service.ts` + controller (uses `serviceId` as SK; singleton `approveJoin` uses `serviceId = 'approveJoin'`)
- Permissions: `backend/src/boards/service-permissions.service.ts` + controller
- Join Requests: `backend/src/boards/join-request.service.ts` + controller
- Board integration: `backend/src/boards/board.controller.ts` enable/disable paths


