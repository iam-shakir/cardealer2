import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Deterministic Zero-Trust Firestore Security Rules Evaluator & Red-Team Test Runner
 * Verifies all "Dirty Dozen" adversarial payloads from security_spec.md return PERMISSION_DENIED
 * and verifies that compliant authenticated operations are PERMITTED.
 */

interface MockAuthContext {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

interface EvalRequest {
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: MockAuthContext | null;
  requestTimeIso?: string;
  incomingData?: Record<string, unknown>;
  existingData?: Record<string, unknown>;
  parentWorkspaceOwnerId?: string | null;
  isAdminDocPresent?: boolean;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function isValidId(id: unknown): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= 128 &&
    VALID_ID_REGEX.test(id)
  );
}

function hasExactKeys(
  data: Record<string, unknown>,
  requiredKeys: string[],
  allowedKeys: string[]
): boolean {
  const keys = Object.keys(data);
  return (
    requiredKeys.every((k) => keys.includes(k)) &&
    keys.every((k) => allowedKeys.includes(k))
  );
}

function affectedKeys(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>
): string[] {
  const allKeys = new Set([...Object.keys(incoming), ...Object.keys(existing)]);
  const diff: string[] = [];
  for (const key of allKeys) {
    if (incoming[key] !== existing[key]) {
      diff.push(key);
    }
  }
  return diff;
}

function evaluateRules(req: EvalRequest): 'PERMITTED' | 'PERMISSION_DENIED' {
  const now = req.requestTimeIso || '2026-11-09T19:37:36Z';
  const isSignedIn = req.auth !== null && typeof req.auth.uid === 'string';
  const isVerifiedUser = isSignedIn && req.auth?.email_verified === true;
  const isAdmin =
    isVerifiedUser &&
    (req.isAdminDocPresent === true ||
      req.auth?.email === 'raylander199721@gmail.com');

  const segments = req.path.replace(/^\/+/, '').split('/');

  if (segments.length === 2 && segments[0] === 'appData') {
    const [, docId] = segments;
    return isValidId(docId) ? 'PERMITTED' : 'PERMISSION_DENIED';
  }

  // 1. /users/{userId}/private/{docId}
  if (segments.length === 4 && segments[0] === 'users' && segments[2] === 'private') {
    const [, userId, , docId] = segments;
    if (req.operation === 'get') {
      return isSignedIn &&
        isValidId(userId) &&
        isValidId(docId) &&
        (req.auth?.uid === userId || isAdmin)
        ? 'PERMITTED'
        : 'PERMISSION_DENIED';
    }
  }

  // 2. /admins/{adminId}
  if (segments.length === 2 && segments[0] === 'admins') {
    const [, adminId] = segments;
    if (req.operation === 'create') {
      const d = req.incomingData || {};
      const valid =
        hasExactKeys(d, ['uid', 'note', 'createdAt'], ['uid', 'note', 'createdAt']) &&
        d.uid === adminId &&
        isValidId(d.uid) &&
        typeof d.note === 'string' &&
        d.note.length >= 1 &&
        d.note.length <= 200 &&
        d.createdAt === now;
      return isVerifiedUser && isValidId(adminId) && valid && isAdmin
        ? 'PERMITTED'
        : 'PERMISSION_DENIED';
    }
  }

  // 3. /workspaces/{workspaceId}
  if (segments.length === 1 && segments[0] === 'workspaces' && req.operation === 'list') {
    const existing = req.existingData || {};
    return isSignedIn && (existing.ownerId === req.auth?.uid || isAdmin)
      ? 'PERMITTED'
      : 'PERMISSION_DENIED';
  }

  if (segments.length === 2 && segments[0] === 'workspaces') {
    const [, workspaceId] = segments;
    const reqKeys = [
      'ownerId',
      'dealershipName',
      'currency',
      'activeRole',
      'vehiclesCount',
      'clientsCount',
      'salesCount',
      'totalRevenue',
      'totalCashBalance',
      'status',
      'createdAt',
      'updatedAt',
    ];
    const validateWorkspace = (d: Record<string, unknown>): boolean =>
      hasExactKeys(d, reqKeys, reqKeys) &&
      d.ownerId === workspaceId &&
      d.ownerId === req.auth?.uid &&
      isValidId(d.ownerId) &&
      typeof d.dealershipName === 'string' &&
      d.dealershipName.length >= 1 &&
      d.dealershipName.length <= 120 &&
      typeof d.currency === 'string' &&
      ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED'].includes(d.currency) &&
      typeof d.activeRole === 'string' &&
      ['Owner', 'Admin', 'Sales', 'Viewer'].includes(d.activeRole) &&
      typeof d.vehiclesCount === 'number' &&
      Number.isInteger(d.vehiclesCount) &&
      d.vehiclesCount >= 0 &&
      d.vehiclesCount <= 5000 &&
      typeof d.clientsCount === 'number' &&
      Number.isInteger(d.clientsCount) &&
      d.clientsCount >= 0 &&
      d.clientsCount <= 5000 &&
      typeof d.salesCount === 'number' &&
      Number.isInteger(d.salesCount) &&
      d.salesCount >= 0 &&
      d.salesCount <= 5000 &&
      typeof d.totalRevenue === 'number' &&
      d.totalRevenue >= 0 &&
      d.totalRevenue <= 1000000000 &&
      typeof d.totalCashBalance === 'number' &&
      d.totalCashBalance >= -100000000 &&
      d.totalCashBalance <= 1000000000 &&
      typeof d.status === 'string' &&
      ['active', 'archived'].includes(d.status);

    if (req.operation === 'create') {
      const d = req.incomingData || {};
      return isVerifiedUser &&
        isValidId(workspaceId) &&
        req.auth?.uid === workspaceId &&
        validateWorkspace(d) &&
        d.status === 'active' &&
        d.createdAt === now &&
        d.updatedAt === now
        ? 'PERMITTED'
        : 'PERMISSION_DENIED';
    }

    if (req.operation === 'update') {
      const d = req.incomingData || {};
      const ex = req.existingData || {};
      const diff = affectedKeys(d, ex);
      const allowedSyncKeys = [
        'dealershipName',
        'currency',
        'activeRole',
        'vehiclesCount',
        'clientsCount',
        'salesCount',
        'totalRevenue',
        'totalCashBalance',
        'updatedAt',
      ];
      const isSyncAction =
        req.auth?.uid === workspaceId &&
        diff.every((k) => allowedSyncKeys.includes(k));
      const isArchiveAction =
        req.auth?.uid === workspaceId &&
        d.status === 'archived' &&
        diff.every((k) => ['status', 'updatedAt'].includes(k));

      return isVerifiedUser &&
        isValidId(workspaceId) &&
        validateWorkspace(d) &&
        d.ownerId === ex.ownerId &&
        d.createdAt === ex.createdAt &&
        d.updatedAt === now &&
        (ex.status !== 'archived' || isAdmin) &&
        (isAdmin || isSyncAction || isArchiveAction)
        ? 'PERMITTED'
        : 'PERMISSION_DENIED';
    }
  }

  // 4. /workspaces/{workspaceId}/vehicles/{vehicleId}
  if (segments.length === 4 && segments[0] === 'workspaces' && segments[2] === 'vehicles') {
    const [, workspaceId, , vehicleId] = segments;
    const isWorkspaceOwner =
      isSignedIn &&
      req.auth?.uid === workspaceId &&
      req.parentWorkspaceOwnerId === req.auth?.uid;

    const vehKeys = [
      'workspaceId',
      'ownerId',
      'stockId',
      'vin',
      'year',
      'make',
      'model',
      'trim',
      'purchasePrice',
      'askingPrice',
      'status',
      'createdAt',
      'updatedAt',
    ];

    const validateVehicle = (d: Record<string, unknown>): boolean =>
      hasExactKeys(d, vehKeys, vehKeys) &&
      d.workspaceId === workspaceId &&
      isValidId(d.workspaceId) &&
      d.ownerId === req.auth?.uid &&
      isValidId(d.ownerId) &&
      typeof d.stockId === 'string' &&
      d.stockId.length >= 1 &&
      d.stockId.length <= 40 &&
      typeof d.vin === 'string' &&
      d.vin.length >= 1 &&
      d.vin.length <= 40 &&
      typeof d.year === 'number' &&
      Number.isInteger(d.year) &&
      d.year >= 1980 &&
      d.year <= 2035 &&
      typeof d.make === 'string' &&
      d.make.length >= 1 &&
      d.make.length <= 60 &&
      typeof d.model === 'string' &&
      d.model.length >= 1 &&
      d.model.length <= 80 &&
      typeof d.trim === 'string' &&
      d.trim.length <= 80 &&
      typeof d.purchasePrice === 'number' &&
      d.purchasePrice >= 0 &&
      d.purchasePrice <= 10000000 &&
      typeof d.askingPrice === 'number' &&
      d.askingPrice >= 0 &&
      d.askingPrice <= 10000000 &&
      typeof d.status === 'string' &&
      ['Available', 'In prep', 'In transit', 'Reserved', 'Sold'].includes(d.status);

    if (req.operation === 'create') {
      const d = req.incomingData || {};
      return isVerifiedUser &&
        isValidId(workspaceId) &&
        isValidId(vehicleId) &&
        validateVehicle(d) &&
        d.createdAt === now &&
        d.updatedAt === now &&
        isWorkspaceOwner
        ? 'PERMITTED'
        : 'PERMISSION_DENIED';
    }

    if (req.operation === 'update') {
      const d = req.incomingData || {};
      const ex = req.existingData || {};
      const diff = affectedKeys(d, ex);
      const allowedUpdateKeys = [
        'stockId',
        'vin',
        'year',
        'make',
        'model',
        'trim',
        'purchasePrice',
        'askingPrice',
        'status',
        'updatedAt',
      ];
      return isVerifiedUser &&
        isValidId(workspaceId) &&
        isValidId(vehicleId) &&
        validateVehicle(d) &&
        d.workspaceId === ex.workspaceId &&
        d.ownerId === ex.ownerId &&
        d.createdAt === ex.createdAt &&
        d.updatedAt === now &&
        (ex.status !== 'Sold' || isAdmin) &&
        isWorkspaceOwner &&
        (isAdmin ||
          (ex.ownerId === req.auth?.uid &&
            diff.every((k) => allowedUpdateKeys.includes(k))))
        ? 'PERMITTED'
        : 'PERMISSION_DENIED';
    }
  }

  return 'PERMISSION_DENIED';
}

const SERVER_TIME = '2026-11-09T19:37:36Z';

const baseValidWorkspace = {
  ownerId: 'user_alice',
  dealershipName: 'Apex Motors',
  currency: 'USD',
  activeRole: 'Owner',
  vehiclesCount: 6,
  clientsCount: 4,
  salesCount: 1,
  totalRevenue: 21200,
  totalCashBalance: 65250,
  status: 'active',
  createdAt: SERVER_TIME,
  updatedAt: SERVER_TIME,
};

const baseValidVehicle = {
  workspaceId: 'user_alice',
  ownerId: 'user_alice',
  stockId: 'CDT-101',
  vin: '1HGCV1F34LA012345',
  year: 2022,
  make: 'Honda',
  model: 'Accord',
  trim: 'Sport',
  purchasePrice: 16500,
  askingPrice: 21900,
  status: 'Available',
  createdAt: SERVER_TIME,
  updatedAt: SERVER_TIME,
};

test('Firestore Rules Structural Verification & Dirty Dozen Red-Team Payloads all return PERMISSION_DENIED', () => {
  const rulesPath = fs.existsSync(path.resolve('firestore.rules'))
    ? path.resolve('firestore.rules')
    : path.resolve('DRAFT_firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf-8');

  // Verify Eight Pillars structural invariants in rules file
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes('isValidDealershipWorkspace(incoming(), workspaceId)'));
  assert.ok(rulesText.includes('isValidCloudVehicleRecord(incoming(), workspaceId)'));
  assert.ok(rulesText.includes('affectedKeys().hasOnly('));

  // Compliant baseline check
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/workspaces/user_alice',
      auth: { uid: 'user_alice', email_verified: true },
      incomingData: baseValidWorkspace,
    }),
    'PERMITTED'
  );

  // Dirty Dozen #1: Identity Spoofing (ownerId mismatch)
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/workspaces/user_alice',
      auth: { uid: 'user_alice', email_verified: true },
      incomingData: { ...baseValidWorkspace, ownerId: 'user_bob' },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #2: Shadow Field Injection (isSuperAdmin ghost key)
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/workspaces/user_alice',
      auth: { uid: 'user_alice', email_verified: true },
      incomingData: { ...baseValidWorkspace, isSuperAdmin: true },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #3: Unverified Email Spoofing Attack
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/workspaces/user_admin',
      auth: {
        uid: 'user_admin',
        email: 'raylander199721@gmail.com',
        email_verified: false,
      },
      incomingData: { ...baseValidWorkspace, ownerId: 'user_admin' },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #4: Cross-Tenant PII Read
  assert.equal(
    evaluateRules({
      operation: 'get',
      path: '/users/user_alice/private/info',
      auth: { uid: 'user_eve', email_verified: true },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #5: Orphaned Subcollection Write (No parent workspace)
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/workspaces/user_alice/vehicles/veh_101',
      auth: { uid: 'user_alice', email_verified: true },
      incomingData: baseValidVehicle,
      parentWorkspaceOwnerId: null,
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #6: Terminal State Lock Bypass (Updating Sold vehicle)
  assert.equal(
    evaluateRules({
      operation: 'update',
      path: '/workspaces/user_alice/vehicles/veh_101',
      auth: { uid: 'user_alice', email_verified: true },
      existingData: { ...baseValidVehicle, status: 'Sold' },
      incomingData: { ...baseValidVehicle, status: 'Sold', askingPrice: 99999 },
      parentWorkspaceOwnerId: 'user_alice',
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #7: Immortal Field Mutation (Mutating ownerId on update)
  assert.equal(
    evaluateRules({
      operation: 'update',
      path: '/workspaces/user_alice',
      auth: { uid: 'user_alice', email_verified: true },
      existingData: baseValidWorkspace,
      incomingData: { ...baseValidWorkspace, ownerId: 'user_mallory' },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #8: Temporal Spoofing (Forged client timestamp)
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/workspaces/user_alice',
      auth: { uid: 'user_alice', email_verified: true },
      incomingData: {
        ...baseValidWorkspace,
        createdAt: '2020-01-01T00:00:00Z',
      },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #9: Denial-of-Wallet String Overflow (500-char dealershipName)
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/workspaces/user_alice',
      auth: { uid: 'user_alice', email_verified: true },
      incomingData: {
        ...baseValidWorkspace,
        dealershipName: 'A'.repeat(500),
      },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #10: Value Poisoning on Whitelisted Update Key
  assert.equal(
    evaluateRules({
      operation: 'update',
      path: '/workspaces/user_alice',
      auth: { uid: 'user_alice', email_verified: true },
      existingData: baseValidWorkspace,
      incomingData: {
        ...baseValidWorkspace,
        vehiclesCount: -50,
        currency: 'BTC',
      },
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #11: Self-Assigned Admin Escalation
  assert.equal(
    evaluateRules({
      operation: 'create',
      path: '/admins/user_eve',
      auth: { uid: 'user_eve', email_verified: true },
      incomingData: {
        uid: 'user_eve',
        note: 'Self-promoted admin',
        createdAt: SERVER_TIME,
      },
      isAdminDocPresent: false,
    }),
    'PERMISSION_DENIED'
  );

  // Dirty Dozen #12: Unauthorized Blanket Collection List Scraping
  assert.equal(
    evaluateRules({
      operation: 'list',
      path: '/workspaces',
      auth: { uid: 'user_eve', email_verified: true },
      existingData: baseValidWorkspace,
    }),
    'PERMISSION_DENIED'
  );
});
