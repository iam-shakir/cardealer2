import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { DealershipState, Vehicle } from './types';

// Initialize Firebase SDK with multi-tab Firestore persistent local cache
const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate Connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('the client is offline') ||
        error.message.includes('Failed to get document from server'))
    ) {
      console.log('Firestore operating in offline persistence mode (persistent local cache active).');
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Defensive sanitization helpers matching firebase-blueprint.json & firestore.rules
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function sanitizeFirestoreId(rawId: string, fallback = 'item-1'): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length >= 1 && SAFE_ID_REGEX.test(cleaned) ? cleaned : fallback;
}

export function clampStr(val: string | undefined | null, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = (val || '').trim();
  const base = trimmed.length >= minLen ? trimmed : fallback;
  return base.slice(0, maxLen);
}

export function clampInt(val: number, min: number, max: number): number {
  const n = Math.round(Number(val) || 0);
  return Math.max(min, Math.min(max, n));
}

export function clampNum(val: number, min: number, max: number): number {
  const n = Number(val) || 0;
  return Number(Math.max(min, Math.min(max, n)).toFixed(2));
}

/**
 * Sign in with Google Popup and initialize user's split profile + dealership workspace
 */
export async function signInWithGooglePopup(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutFirebaseUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Syncs the authenticated user's split profile (/users/{uid}/public/profile and /users/{uid}/private/info)
 */
export async function syncUserProfileToFirestore(
  user: User,
  dealershipName: string,
  phone = ''
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeFirestoreId(user.uid, 'user_default');
  const publicPath = `users/${uid}/public/profile`;
  const privatePath = `users/${uid}/private/info`;

  const safeDisplayName = clampStr(
    user.displayName || user.email?.split('@')[0],
    1,
    100,
    'Dealer Principal'
  );
  const safeDealershipTitle = clampStr(
    dealershipName,
    1,
    120,
    'Apex Motors & Auto Group'
  );
  const safeEmail = clampStr(user.email, 3, 160, 'dealer@example.com');
  const safePhone = clampStr(phone || user.phoneNumber, 0, 40, '');

  // 1. Public Profile
  try {
    const pubRef = doc(db, 'users', uid, 'public', 'profile');
    const pubSnap = await getDoc(pubRef);
    if (!pubSnap.exists()) {
      await setDoc(pubRef, {
        uid,
        displayName: safeDisplayName,
        dealershipTitle: safeDealershipTitle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(pubRef, {
        displayName: safeDisplayName,
        dealershipTitle: safeDealershipTitle,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  // 2. Strictly Isolated Private PII Profile
  try {
    const privRef = doc(db, 'users', uid, 'private', 'info');
    const privSnap = await getDoc(privRef);
    if (!privSnap.exists()) {
      await setDoc(privRef, {
        uid,
        email: safeEmail,
        phone: safePhone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(privRef, {
        email: safeEmail,
        phone: safePhone,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

/**
 * Creates or updates the user's Root Dealership Workspace (/workspaces/{uid})
 */
export async function syncDealershipWorkspaceToFirestore(
  user: User,
  state: DealershipState
): Promise<void> {
  if (!user.emailVerified) return;
  const workspaceId = sanitizeFirestoreId(user.uid, 'ws_default');
  const wsPath = `workspaces/${workspaceId}`;

  const allowedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED'];
  const allowedRoles = ['Owner', 'Admin', 'Sales', 'Viewer'];

  const safeDealershipName = clampStr(
    state.settings.dealershipName,
    1,
    120,
    'Apex Motors & Auto Group'
  );
  const safeCurrency = allowedCurrencies.includes(state.settings.currency)
    ? state.settings.currency
    : 'USD';
  const safeRole = allowedRoles.includes(state.settings.activeRole)
    ? state.settings.activeRole
    : 'Owner';

  const vehiclesCount = clampInt(state.vehicles.length, 0, 5000);
  const clientsCount = clampInt(state.clients.length, 0, 5000);
  const salesCount = clampInt(state.sales.length, 0, 5000);

  const rawRevenue =
    state.sales.reduce((s, r) => s + r.saleAmount, 0) +
    state.partSales.reduce((s, r) => s + r.totalRevenue, 0);
  const totalRevenue = clampNum(rawRevenue, 0, 1000000000);

  const rawCash = state.accounts.reduce((s, a) => s + a.balance, 0);
  const totalCashBalance = clampNum(rawCash, -100000000, 1000000000);

  try {
    const wsRef = doc(db, 'workspaces', workspaceId);
    const snap = await getDoc(wsRef);
    if (!snap.exists()) {
      await setDoc(wsRef, {
        ownerId: workspaceId,
        dealershipName: safeDealershipName,
        currency: safeCurrency,
        activeRole: safeRole,
        vehiclesCount,
        clientsCount,
        salesCount,
        totalRevenue,
        totalCashBalance,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data()?.status !== 'archived') {
      await updateDoc(wsRef, {
        dealershipName: safeDealershipName,
        currency: safeCurrency,
        activeRole: safeRole,
        vehiclesCount,
        clientsCount,
        salesCount,
        totalRevenue,
        totalCashBalance,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, wsPath);
  }
}

/**
 * Syncs a vehicle record into /workspaces/{workspaceId}/vehicles/{vehicleId}
 */
export async function syncVehicleToFirestore(
  user: User,
  vehicle: Vehicle
): Promise<void> {
  if (!user.emailVerified) return;
  const workspaceId = sanitizeFirestoreId(user.uid, 'ws_default');
  const vehicleId = sanitizeFirestoreId(vehicle.id, 'veh_1');
  const vehPath = `workspaces/${workspaceId}/vehicles/${vehicleId}`;

  const allowedStatuses = ['Available', 'In prep', 'In transit', 'Reserved', 'Sold'];
  const safeStatus = allowedStatuses.includes(vehicle.status)
    ? vehicle.status
    : 'Available';

  try {
    const vehRef = doc(db, 'workspaces', workspaceId, 'vehicles', vehicleId);
    const snap = await getDoc(vehRef);
    if (!snap.exists()) {
      await setDoc(vehRef, {
        workspaceId,
        ownerId: workspaceId,
        stockId: clampStr(vehicle.stockId, 1, 40, 'CDT-100'),
        vin: clampStr(vehicle.vin, 1, 40, 'UNKNOWN-VIN'),
        year: clampInt(vehicle.year, 1980, 2035),
        make: clampStr(vehicle.make, 1, 60, 'Make'),
        model: clampStr(vehicle.model, 1, 80, 'Model'),
        trim: clampStr(vehicle.trim, 0, 80, ''),
        purchasePrice: clampNum(vehicle.purchasePrice, 0, 10000000),
        askingPrice: clampNum(vehicle.askingPrice, 0, 10000000),
        status: safeStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data()?.status !== 'Sold') {
      await updateDoc(vehRef, {
        stockId: clampStr(vehicle.stockId, 1, 40, 'CDT-100'),
        vin: clampStr(vehicle.vin, 1, 40, 'UNKNOWN-VIN'),
        year: clampInt(vehicle.year, 1980, 2035),
        make: clampStr(vehicle.make, 1, 60, 'Make'),
        model: clampStr(vehicle.model, 1, 80, 'Model'),
        trim: clampStr(vehicle.trim, 0, 80, ''),
        purchasePrice: clampNum(vehicle.purchasePrice, 0, 10000000),
        askingPrice: clampNum(vehicle.askingPrice, 0, 10000000),
        status: safeStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, vehPath);
  }
}

/**
 * Appends an immutable cloud sync or voice audit log entry under /workspaces/{workspaceId}/syncLogs/{logId}
 */
export async function appendCloudSyncAuditLog(
  user: User,
  input: {
    id?: string;
    title: string;
    summary: string;
    category: string;
    vehiclesCount: number;
  }
): Promise<void> {
  if (!user.emailVerified) return;
  const workspaceId = sanitizeFirestoreId(user.uid, 'ws_default');
  const logId = sanitizeFirestoreId(input.id || `sync-${Date.now()}`, `sync_${Date.now()}`);
  const logPath = `workspaces/${workspaceId}/syncLogs/${logId}`;

  try {
    const logRef = doc(db, 'workspaces', workspaceId, 'syncLogs', logId);
    await setDoc(logRef, {
      workspaceId,
      ownerId: workspaceId,
      title: clampStr(input.title, 1, 140, 'Workspace Cloud Sync'),
      summary: clampStr(input.summary, 1, 500, 'Synced dealership state to Firestore.'),
      category: clampStr(input.category, 1, 80, 'Cloud Sync'),
      vehiclesCount: clampInt(input.vehiclesCount, 0, 5000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, logPath);
  }
}

export interface CloudWorkspaceSnapshot {
  dealershipName: string;
  currency: string;
  activeRole: string;
  vehiclesCount: number;
  clientsCount: number;
  salesCount: number;
  totalRevenue: number;
  totalCashBalance: number;
  status: string;
  syncedVehiclesCount: number;
  lastCloudSyncIso: string | null;
}

/**
 * Subscribes to live Firestore workspace & vehicle updates for the authenticated user
 */
export function subscribeToCloudWorkspace(
  user: User,
  onUpdate: (snapshot: Partial<CloudWorkspaceSnapshot>) => void
): Unsubscribe {
  const workspaceId = sanitizeFirestoreId(user.uid, 'ws_default');
  const wsPath = `workspaces/${workspaceId}`;
  const vehCollectionPath = `workspaces/${workspaceId}/vehicles`;

  const wsRef = doc(db, 'workspaces', workspaceId);
  const unsubWs = onSnapshot(
    wsRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        onUpdate({
          dealershipName: d.dealershipName,
          currency: d.currency,
          activeRole: d.activeRole,
          vehiclesCount: d.vehiclesCount,
          clientsCount: d.clientsCount,
          salesCount: d.salesCount,
          totalRevenue: d.totalRevenue,
          totalCashBalance: d.totalCashBalance,
          status: d.status,
          lastCloudSyncIso: new Date().toISOString(),
        });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, wsPath);
    }
  );

  const vehQuery = query(
    collection(db, 'workspaces', workspaceId, 'vehicles'),
    where('ownerId', '==', workspaceId)
  );
  const unsubVeh = onSnapshot(
    vehQuery,
    (querySnap) => {
      onUpdate({
        syncedVehiclesCount: querySnap.size,
        lastCloudSyncIso: new Date().toISOString(),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, vehCollectionPath);
    }
  );

  return () => {
    unsubWs();
    unsubVeh();
  };
}

/**
 * Saves the entire application DealershipState directly to Firebase Firestore
 */
export async function saveDealershipStateToFirestore<T>(
  state: T,
  docId = 'dealershipState'
): Promise<void> {
  const safeDocId = sanitizeFirestoreId(docId, 'dealershipState');
  const path = `appData/${safeDocId}`;
  try {
    const docRef = doc(db, 'appData', safeDocId);
    await setDoc(docRef, {
      ...(state as any),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Subscribes to real-time updates for application state stored in Firebase Firestore
 */
export function subscribeToDealershipStateFromFirestore<T>(
  onData: (data: T) => void,
  initialFallback: T,
  docId = 'dealershipState'
): Unsubscribe {
  const safeDocId = sanitizeFirestoreId(docId, 'dealershipState');
  const docRef = doc(db, 'appData', safeDocId);

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const { updatedAt, ...cleanState } = data;
        onData(cleanState as T);
      } else {
        void setDoc(docRef, {
          ...(initialFallback as any),
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          console.error('Error seeding initial Firestore state:', err);
        });
        onData(initialFallback);
      }
    },
    (error) => {
      console.warn('Firestore onSnapshot subscription warning:', error);
      onData(initialFallback);
    }
  );
}

/**
 * Resets application state stored in Firebase Firestore back to initial values
 */
export async function resetDealershipStateInFirestore<T>(
  initialState: T,
  docId = 'dealershipState'
): Promise<void> {
  const safeDocId = sanitizeFirestoreId(docId, 'dealershipState');
  const path = `appData/${safeDocId}`;
  try {
    const docRef = doc(db, 'appData', safeDocId);
    await setDoc(docRef, {
      ...(initialState as any),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export { onAuthStateChanged };
export type { User as FirebaseUser };
