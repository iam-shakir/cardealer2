# Phase 0: Payload-First Security TDD Specification (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth

1. **Global Default-Deny Safety Net**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Verified Authentication Invariant**: All write operations require a signed-in user with a verified email (`request.auth != null && request.auth.token.email_verified == true`).
3. **PII Split-Collection Isolation**:
   - Public user metadata (`/users/{userId}/public/{docId}`) never stores `email` or `phone`.
   - Private PII (`/users/{userId}/private/{docId}`) stores `email` and `phone` and is strictly readable and writable only by `request.auth.uid == userId` or `isAdmin()`.
4. **Master Gate Relational Hierarchy**:
   - `/workspaces/{workspaceId}` is the Master Source of Truth for a dealership workspace, where `workspaceId == request.auth.uid` and `ownerId == request.auth.uid`.
   - Subcollections `/workspaces/{workspaceId}/vehicles/{vehicleId}` and `/workspaces/{workspaceId}/syncLogs/{logId}` must verify parent existence and ownership via `get(/databases/$(database)/documents/workspaces/$(workspaceId)).data.ownerId == request.auth.uid`.
5. **Strict Key & Volumetric Validation Blueprints (`isValid[Entity]`)**:
   - Every `create` and `update` operation invokes `isValid[Entity](incoming())`, enforcing `data.keys().hasAll(...) && data.keys().hasOnly(...)`, exact primitive types, regex ID guards (`^[a-zA-Z0-9_\-]+$`), and `.size()` boundary checks on every string.
6. **Temporal & Identity Immutability**:
   - `createdAt` must equal `request.time` on `create` and remain strictly equal to `resource.data.createdAt` on `update`.
   - `updatedAt` must equal `request.time` on both `create` and `update`.
   - `ownerId` and `workspaceId` are immutable after creation.
7. **Terminal State Locking**:
   - Once a `DealershipWorkspace` reaches `status == 'archived'`, or a `CloudVehicleRecord` reaches `status == 'Sold'`, further non-admin updates are rejected.
8. **Query Enforcer (`allow list`)**:
   - Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid` (or `isAdmin()`) without `get()`/`exists()` calls inside `list`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Identity Spoofing (`ownerId` Mismatch on Workspace Create)**:
   ```json
   {
     "path": "/workspaces/user_alice",
     "auth": { "uid": "user_alice", "email_verified": true },
     "data": {
       "ownerId": "user_bob",
       "dealershipName": "Apex Motors",
       "currency": "USD",
       "activeRole": "Owner",
       "vehiclesCount": 6,
       "clientsCount": 4,
       "salesCount": 1,
       "totalRevenue": 21200,
       "totalCashBalance": 65250,
       "status": "active",
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
2. **Payload 2 — Shadow Field Injection (`isSuperAdmin: true` Ghost Key)**:
   ```json
   {
     "path": "/workspaces/user_alice",
     "auth": { "uid": "user_alice", "email_verified": true },
     "data": {
       "ownerId": "user_alice",
       "dealershipName": "Apex Motors",
       "currency": "USD",
       "activeRole": "Owner",
       "vehiclesCount": 6,
       "clientsCount": 4,
       "salesCount": 1,
       "totalRevenue": 21200,
       "totalCashBalance": 65250,
       "status": "active",
       "isSuperAdmin": true,
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
3. **Payload 3 — Unverified Email Spoofing Attack (`email_verified: false`)**:
   ```json
   {
     "path": "/workspaces/user_admin",
     "auth": { "uid": "user_admin", "email": "raylander199721@gmail.com", "email_verified": false },
     "data": {
       "ownerId": "user_admin",
       "dealershipName": "Spoofed Admin Lot",
       "currency": "USD",
       "activeRole": "Owner",
       "vehiclesCount": 1,
       "clientsCount": 1,
       "salesCount": 0,
       "totalRevenue": 0,
       "totalCashBalance": 1000,
       "status": "active",
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
4. **Payload 4 — Cross-Tenant PII Read (`/users/user_alice/private/info` read by `user_eve`)**:
   ```json
   {
     "operation": "get",
     "path": "/users/user_alice/private/info",
     "auth": { "uid": "user_eve", "email_verified": true }
   }
   ```
5. **Payload 5 — Orphaned Subcollection Write (Creating Vehicle under Non-Existent Workspace)**:
   ```json
   {
     "path": "/workspaces/non_existent_ws/vehicles/veh_101",
     "auth": { "uid": "non_existent_ws", "email_verified": true },
     "data": {
       "workspaceId": "non_existent_ws",
       "ownerId": "non_existent_ws",
       "stockId": "CDT-101",
       "vin": "1HGCV1F34LA012345",
       "year": 2022,
       "make": "Honda",
       "model": "Accord",
       "trim": "Sport",
       "purchasePrice": 16500,
       "askingPrice": 21900,
       "status": "Available",
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
6. **Payload 6 — Terminal State Lock Bypass (Updating Vehicle after `status == 'Sold'`)**:
   ```json
   {
     "operation": "update",
     "path": "/workspaces/user_alice/vehicles/veh_sold_1",
     "auth": { "uid": "user_alice", "email_verified": true },
     "existingData": { "status": "Sold" },
     "updateData": { "askingPrice": 99999, "updatedAt": "SERVER_TIMESTAMP" }
   }
   ```
7. **Payload 7 — Immortal Field Mutation (Mutating `createdAt` or `ownerId` on Update)**:
   ```json
   {
     "operation": "update",
     "path": "/workspaces/user_alice",
     "auth": { "uid": "user_alice", "email_verified": true },
     "updateData": { "ownerId": "user_mallory", "updatedAt": "SERVER_TIMESTAMP" }
   }
   ```
8. **Payload 8 — Temporal Spoofing (Forged Past/Future Client Timestamp)**:
   ```json
   {
     "path": "/workspaces/user_alice",
     "auth": { "uid": "user_alice", "email_verified": true },
     "data": {
       "createdAt": "2020-01-01T00:00:00Z",
       "updatedAt": "2020-01-01T00:00:00Z"
     }
   }
   ```
9. **Payload 9 — Denial-of-Wallet String Overflow (500-char `dealershipName`)**:
   ```json
   {
     "path": "/workspaces/user_alice",
     "auth": { "uid": "user_alice", "email_verified": true },
     "data": {
       "dealershipName": "A_500_CHARACTER_OVERFLOW_STRING..."
     }
   }
   ```
10. **Payload 10 — Value Poisoning on Whitelisted Update Key (`vehiclesCount: -50` or `currency: 'BTC'`)**:
    ```json
    {
      "operation": "update",
      "path": "/workspaces/user_alice",
      "auth": { "uid": "user_alice", "email_verified": true },
      "updateData": { "vehiclesCount": -50, "currency": "BTC", "updatedAt": "SERVER_TIMESTAMP" }
    }
    ```
11. **Payload 11 — Self-Assigned Admin Escalation (User writing to `/admins/user_eve`)**:
    ```json
    {
      "path": "/admins/user_eve",
      "auth": { "uid": "user_eve", "email_verified": true },
      "data": { "uid": "user_eve", "note": "Self-promoted admin", "createdAt": "SERVER_TIMESTAMP" }
    }
    ```
12. **Payload 12 — Unauthorized Blanket Collection List Scraping (`list` without owner filter)**:
    ```json
    {
      "operation": "list",
      "path": "/workspaces",
      "auth": { "uid": "user_eve", "email_verified": true }
    }
    ```
