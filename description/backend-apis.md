[⬅ Back to README](../README.md)

## REST API Surface

Controller to endpoint mapping, grouped by domain. All protected endpoints use `JwtAuthGuard` unless marked public.

### Authentication and Profile
- Public
  - `POST /signup` → `CognitoController.signUp`
  - `POST /confirm` → `CognitoController.confirmSignUp`
  - `POST /signin` → `CognitoController.signIn`
  - `GET /logout` → `CognitoController.logout`
- Protected
  - `GET /profile` → `ProfileController.me`
  - `POST /profile/username` → `ProfileController.setUsername`
  - Public: `GET /profile/username-exists?username=` → `ProfileController.usernameExists`

### Boards
- Public
  - `GET /boards` (optional `?ownerId=`)
- Protected
  - `GET /boards/my`
  - `POST /boards`
  - `PUT /boards/:id`
  - `GET /boards/:id/permissions`

### Memberships
- Protected
  - `POST /boards/:id/join`
  - `GET /boards/my-memberships`
  - `GET /boards/my-memberships-detailed`
  - `GET /boards/:id/members/:role`
  - `PUT /boards/:id/members/:userId/role`
  - Deprecated: `GET /boards/:id/members/:userId/permissions`

### Join Requests (approveJoin service)
- Protected
  - `POST /boards/:id/request`
  - `GET /boards/:id/requests` (owner-only)
  - `POST /boards/:id/requests/:uid/approve` (owner-only)
  - `POST /boards/:id/requests/:uid/reject` (owner-only)

### Service Catalog and Settings
- Public
  - `GET /services` → list `AvailableServices`
- Protected (owner-only actions)
  - `GET /boards/:id/services`
  - `GET /boards/:id/services/:key`
  - `PUT /boards/:id/services/:serviceKey`
  - `DELETE /boards/:id/services/:serviceKey`

### Per-service Permissions
- Protected
  - `PUT /boards/:id/services/:serviceKey/permissions/:userId` (owner-only)
  - `DELETE /boards/:id/services/:serviceKey/permissions/:userId` (owner-only)
  - `GET /boards/:id/services/:serviceKey/permissions` (owner-only)
  - `GET /boards/:id/services/:serviceKey/permissions/me`

