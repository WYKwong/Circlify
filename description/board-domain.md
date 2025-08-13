[⬅ Back to README](../README.md)

## Board Domain Design

### Entities
- Board: metadata and enabled services
- Membership: relation of user to board with role (`member`, `manager`, `owner`)
- JoinRequest: pending join entries when `approveJoin` is enabled
- AvailableService: global catalog of optional features (e.g., `approveJoin`)
- BoardServiceSetting: per-board configuration per service instance (SK uses `serviceId`); singleton services set `serviceId = serviceType`
- BoardServicePermission: manager-level permission for a service

### Roles and Authorization
- Owner: full control; implicitly allowed for all service actions
- Manager: must have explicit per-service permission to act
- Member: basic participation; no management actions

### Key Flows
1) Board Creation
   - Owner creates with unique `boardName`, selects `enabledServices`
   - Creator is added as `owner`
   - Optional per-service settings stored under `BoardServiceSettings`

2) Joining a Board
   - If `approveJoin` disabled → direct `member` join
   - If enabled → a `JoinRequest` is created; if `askQuestion` is on and `questionText` is set, an answer is required

3) Approvals
   - Board owner reviews `JoinRequest`s
   - Approve → membership created and request deleted
   - Reject → request deleted

4) Manager Permissions
   - Owner grants or revokes per-service permissions (e.g., for `approveJoin`) to managers via `BoardServicePermissions`
   - UI checks `GET /boards/:id/services/:serviceType/permissions/me` to toggle features


