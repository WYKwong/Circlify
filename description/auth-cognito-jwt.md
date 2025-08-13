[⬅ Back to README](../README.md)

## Authentication, Cognito, and JWT Sessions

### Overview
- User management is handled by Amazon Cognito. Application sessions are maintained using a signed JWT stored in an HTTP-only cookie `token`.
- The backend reads this cookie via a custom Passport JWT strategy and attaches the decoded payload to `req.user`.

### Key Components (backend)
- `backend/src/auth/cognito.service.ts`: Calls Cognito (signup, confirm, signin, get user)
- `backend/src/auth/cognito.controller.ts`: Public endpoints for `/signup`, `/confirm`, `/signin`, `/logout`; issues the app JWT cookie
- `backend/src/auth/jwt.strategy.ts`: Extracts JWT from `token` cookie and validates it
- `backend/src/auth/auth.service.ts`: Signs app JWTs and demo local login for MVP
- `backend/src/auth/profile.controller.ts`: Profile and username endpoints guarded by JWT

### Flows
1) Sign Up
   - Client calls `POST /signup` with email, password
   - Cognito user created with email attribute

2) Confirm Sign Up
   - Client calls `POST /confirm` with email, code
   - Backend confirms in Cognito, creates `UserProfiles` record if missing, and issues app JWT cookie so user can immediately set a username

3) Sign In
   - Client calls `POST /signin` with email, password
   - Backend authenticates against Cognito, resolves attributes, merges stored `userName` if present, signs app JWT, sets `token` cookie

4) Logout
   - `GET /logout` clears the cookie and redirects to Cognito logout URL

### JWT Details
- Cookie name: `token` (HTTP-only, `SameSite=Lax`, Secure in production)
- Secret: `JWT_SECRET` env (defaults to `secret` in dev)
- Payload: includes `sub` (Cognito username/subject) and selected attributes; may include `userName`

### Environment Variables (backend)
- `AWS_REGION`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_CLIENT_SECRET`
- `COGNITO_DOMAIN`
- `FRONTEND_URL`
- `SESSION_SECRET`
- `JWT_SECRET`


