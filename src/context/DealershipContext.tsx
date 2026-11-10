import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ClientDocument,
  ClientInteraction,
  ClientLead,
  CrmStage,
  CsvPartBatchInput,
  DealershipState,
  DebtRecord,
  Expense,
  FinancialAccount,
  IdeaItem,
  LedgerTransaction,
  ModuleRoute,
  PartBatch,
  PartItem,
  PartReorderRequest,
  PartSaleRecord,
  PendingActionPreview,
  RoleType,
  SaleRecord,
  TeamMember,
  TreasuryAuditLogEntry,
  Vehicle,
  WorkspaceSettings,
} from '../types';
import { INITIAL_DEALERSHIP_STATE } from '../data/seedData';
import {
  allocateFifoPartBatches,
  autoCategorizeTransaction,
  calculateVehicleNetProfit,
  calculateVehicleTotalCost,
  canMutateWorkspace,
  canViewSensitiveFinancials,
  CommandPaletteResultItem,
  formatMoney,
  generatePartReorderRequest,
  getLowStockPartAlerts,
  settleDebtRecord,
  updateAccountBalance,
} from '../utils/accounting';
import {
  appendCloudSyncAuditLog,
  auth,
  CloudWorkspaceSnapshot,
  FirebaseUser,
  onAuthStateChanged,
  resetDealershipStateInFirestore,
  saveDealershipStateToFirestore,
  signInWithGooglePopup,
  signOutFirebaseUser,
  subscribeToCloudWorkspace,
  subscribeToDealershipStateFromFirestore,
  syncDealershipWorkspaceToFirestore,
  syncUserProfileToFirestore,
  syncVehicleToFirestore,
} from '../firebase';

const STORAGE_KEY = 'car_dealer_tracker_v250_state';

/**
 * Custom Firebase Firestore Database Persistence Hook (`usePersistence`)
 * Primary Database Storage for the application state (`DealershipState`) in Firebase Firestore
 * with real-time `onSnapshot` synchronization across all tabs and devices.
 */
export function usePersistence<T>(
  key: string,
  initialValue: T,
  validator?: (val: any) => boolean
): {
  state: T;
  setState: React.Dispatch<React.SetStateAction<T>>;
  clearPersistence: () => Promise<void>;
  isHydrated: boolean;
  lastSyncedAt: string | null;
} {
  const isValid = useCallback(
    (val: any): val is T => {
      if (!val || typeof val !== 'object') return false;
      return validator ? validator(val) : true;
    },
    [validator]
  );

  const [state, setStateInternal] = useState<T>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = window.localStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (isValid(parsed)) {
            if (!Array.isArray((parsed as any).auditLogs)) {
              (parsed as any).auditLogs = (INITIAL_DEALERSHIP_STATE as any).auditLogs || [];
            }
            if (Array.isArray((parsed as any).clients)) {
              (parsed as any).clients = (parsed as any).clients.map((cli: any) => {
                if (Array.isArray(cli.documents)) return cli;
                const seedClient = INITIAL_DEALERSHIP_STATE.clients.find((sc) => sc.id === cli.id);
                return {
                  ...cli,
                  documents: seedClient?.documents || [],
                };
              });
            }
            return parsed;
          }
        }
      } catch (_e) {
        // Fallback to initialValue if localStorage cache is unavailable
      }
    }
    return initialValue;
  });

  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Subscribe to Firebase Firestore state
  useEffect(() => {
    const docId = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const unsub = subscribeToDealershipStateFromFirestore<T>(
      (remoteState) => {
        if (isValid(remoteState)) {
          if (!Array.isArray((remoteState as any).auditLogs)) {
            (remoteState as any).auditLogs = (INITIAL_DEALERSHIP_STATE as any).auditLogs || [];
          }
          if (Array.isArray((remoteState as any).clients)) {
            (remoteState as any).clients = (remoteState as any).clients.map((cli: any) => {
              if (Array.isArray(cli.documents)) return cli;
              const seedClient = INITIAL_DEALERSHIP_STATE.clients.find((sc) => sc.id === cli.id);
              return {
                ...cli,
                documents: seedClient?.documents || [],
              };
            });
          }
          setStateInternal(remoteState);
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              window.localStorage.setItem(key, JSON.stringify(remoteState));
            } catch (_e) {
              // ignore
            }
          }
        }
        setIsHydrated(true);
        setLastSyncedAt(new Date().toISOString());
      },
      initialValue,
      docId
    );

    return () => {
      unsub();
    };
  }, [key, initialValue, isValid]);

  // Persist every state change directly to Firebase Firestore
  const setState: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (updater) => {
      setStateInternal((prev) => {
        const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.setItem(key, JSON.stringify(next));
          } catch (_e) {
            // ignore quota error
          }
        }
        const docId = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
        void saveDealershipStateToFirestore(next, docId)
          .then(() => {
            setLastSyncedAt(new Date().toISOString());
          })
          .catch((err) => {
            console.warn('Firebase Firestore persistence write warning:', err);
          });
        return next;
      });
    },
    [key]
  );

  const clearPersistence = useCallback(async () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch (_e) {
        // ignore
      }
    }
    const docId = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
    await resetDealershipStateInFirestore(initialValue, docId);
    setLastSyncedAt(new Date().toISOString());
  }, [key, initialValue]);

  return {
    state,
    setState,
    clearPersistence,
    isHydrated,
    lastSyncedAt,
  };
}

export type ActiveModalType =
  | null
  | 'add_vehicle'
  | 'add_expense'
  | 'record_sale'
  | 'add_client'
  | 'add_part_stock'
  | 'record_part_sale'
  | 'allocate_part'
  | 'add_account'
  | 'add_transaction'
  | 'add_debt'
  | 'settle_debt'
  | 'new_idea'
  | 'invite_member'
  | 'deal_desk'
  | 'whats_new'
  | 'command_search'
  | 'window_sticker'
  | 'whatsapp_share'
  | 'pdf_report';

export interface ModalContextPayload {
  vehicleId?: string;
  debtId?: string;
  partId?: string;
}

interface DealershipContextValue {
  state: DealershipState;
  isHydrated: boolean;
  lastSyncedAt: string | null;
  activeRoute: ModuleRoute;
  setActiveRoute: (route: ModuleRoute) => void;
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  selectedTreasuryTarget: {
    id: string;
    subType: 'transaction' | 'account' | 'debt' | 'audit_log';
    queryHint?: string;
  } | null;
  setSelectedTreasuryTarget: (
    target: {
      id: string;
      subType: 'transaction' | 'account' | 'debt' | 'audit_log';
      queryHint?: string;
    } | null
  ) => void;
  jumpToCommandPaletteResult: (item: CommandPaletteResultItem) => void;
  activeModal: ActiveModalType;
  modalPayload: ModalContextPayload;
  openModal: (modal: ActiveModalType, payload?: ModalContextPayload) => void;
  closeModal: () => void;
  isAssistantOpen: boolean;
  setIsAssistantOpen: (open: boolean) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  // Firebase Auth & Firestore Cloud Sync
  firebaseUser: FirebaseUser | null;
  isAuthReady: boolean;
  cloudSyncSummary: Partial<CloudWorkspaceSnapshot>;
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  syncNowToFirebase: () => Promise<void>;
  // RBAC & formatting helpers
  isSensitiveVisible: boolean;
  canMutate: boolean;
  fmtMoney: (amountUsd: number, forceSensitiveCheck?: boolean) => string;
  // Mutations
  addVehicle: (
    v: Omit<Vehicle, 'id' | 'daysInStock' | 'accruedHoldingCost'>,
    extraReconExpense?: number
  ) => Vehicle;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  addExpense: (e: Omit<Expense, 'id'>) => Expense;
  recordSale: (
    s: Omit<SaleRecord, 'id' | 'totalCostSnapshot' | 'netProfitSnapshot'>
  ) => SaleRecord;
  addClient: (c: Omit<ClientLead, 'id' | 'interactions'>) => ClientLead;
  updateClientStage: (clientId: string, stage: CrmStage) => void;
  addClientInteraction: (
    clientId: string,
    interaction: Omit<ClientInteraction, 'id' | 'date'>
  ) => void;
  addClientDocument: (
    clientId: string,
    doc: Omit<ClientDocument, 'id' | 'clientId' | 'uploadedAt' | 'uploadedBy'>
  ) => ClientDocument;
  removeClientDocument: (clientId: string, documentId: string) => void;
  toggleVerifyClientDocument: (clientId: string, documentId: string) => void;
  addPartStock: (input: {
    existingPartId?: string;
    name: string;
    code: string;
    category: string;
    batchLabel: string;
    quantity: number;
    unitCost: number;
    purchaseDate: string;
    paidFromAccountId: string;
    invoiceScanUrl?: string;
    invoiceNumber?: string;
    vendorName?: string;
    scanDocType?: 'Service Invoice' | 'Vehicle Title';
  }) => void;
  attachScanToPartBatch: (
    batchId: string,
    scan: {
      invoiceScanUrl: string;
      invoiceNumber: string;
      vendorName: string;
      scanDocType: 'Service Invoice' | 'Vehicle Title';
    }
  ) => void;
  batchImportPartsCsv: (
    items: CsvPartBatchInput[],
    paidFromAccountId: string,
    recordLedgerOutflow?: boolean
  ) => { importedBatchesCount: number; totalUnits: number; totalSpend: number };
  allocatePartToVehicle: (input: {
    partId: string;
    vehicleId: string;
    quantity: number;
    notes?: string;
  }) => void;
  recordPartSale: (input: {
    partId: string;
    quantity: number;
    unitPrice: number;
    saleDate: string;
    buyer: string;
    phone: string;
    paymentMethod: PartSaleRecord['paymentMethod'];
    depositToAccountId: string;
  }) => void;
  createReorderRequest: (
    partId: string,
    customQty?: number,
    notes?: string
  ) => PartReorderRequest;
  updateReorderRequestStatus: (
    requestId: string,
    status: 'Draft' | 'Ordered' | 'Received'
  ) => void;
  receiveReorderRequest: (
    requestId: string,
    paidFromAccountId?: string
  ) => void;
  deleteReorderRequest: (requestId: string) => void;
  addAccount: (acc: Omit<FinancialAccount, 'id' | 'balance'>) => void;
  addManualTransaction: (tx: {
    accountId: string;
    type: 'Deposit' | 'Withdrawal';
    amount: number;
    date: string;
    note: string;
  }) => void;
  addDebt: (
    d: Omit<DebtRecord, 'id' | 'paidAmount' | 'status' | 'isOverdue'>
  ) => void;
  settleDebt: (debtId: string, amount: number, accountId: string) => void;
  // Treasury Ledger Categorization & Automated Bank Reconciliation
  recategorizeTransaction: (txId: string, category: string) => void;
  reconcileTransaction: (
    txId: string,
    reconciled: boolean,
    bankReference?: string
  ) => void;
  autoCategorizeAllTransactions: () => number;
  reconcileAllMatchedTransactions: (accountId: string) => number;
  // Treasury Audit Log (Voice Memos & Text Summaries)
  addAuditLogEntry: (
    entry: Omit<TreasuryAuditLogEntry, 'id' | 'timestamp'>
  ) => TreasuryAuditLogEntry;
  deleteAuditLogEntry: (id: string) => void;
  addIdea: (title: string, details: string) => void;
  toggleIdeaVote: (ideaId: string) => void;
  inviteTeamMember: (email: string, role: RoleType) => void;
  setActiveRole: (role: RoleType) => void;
  updateSettings: (patch: Partial<WorkspaceSettings>) => void;
  toggleOnlineStatus: () => void;
  resetToDemoData: () => void;
  // AI Assistant Preview-Then-Confirm & 1-Click Undo
  applyPendingAiAction: (action: PendingActionPreview) => string;
  undoAiSnapshot: (snapshotId: string) => boolean;
}

const DealershipContext = createContext<DealershipContextValue | null>(null);

const validateDealershipState = (parsed: any): boolean =>
  Boolean(
    parsed &&
      Array.isArray(parsed.vehicles) &&
      Array.isArray(parsed.expenses) &&
      Array.isArray(parsed.sales) &&
      Array.isArray(parsed.accounts) &&
      parsed.settings
  );

export const DealershipProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    state,
    setState,
    clearPersistence,
    isHydrated,
    lastSyncedAt,
  } = usePersistence<DealershipState>(
    STORAGE_KEY,
    INITIAL_DEALERSHIP_STATE,
    validateDealershipState
  );

  const [activeRoute, setActiveRouteState] = useState<ModuleRoute>(() => {
    const hash = window.location.hash.replace('#', '') as ModuleRoute;
    const validRoutes: ModuleRoute[] = [
      'dashboard',
      'inventory',
      'expenses',
      'sales',
      'clients',
      'parts',
      'finance',
      'reports',
      'ideas',
      'team',
      'settings',
    ];
    return validRoutes.includes(hash) ? hash : 'dashboard';
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    INITIAL_DEALERSHIP_STATE.clients[0]?.id || null
  );
  const [selectedTreasuryTarget, setSelectedTreasuryTarget] = useState<{
    id: string;
    subType: 'transaction' | 'account' | 'debt' | 'audit_log';
    queryHint?: string;
  } | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [modalPayload, setModalPayload] = useState<ModalContextPayload>({});
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [undoSnapshots, setUndoSnapshots] = useState<Record<string, DealershipState>>({});
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [cloudSyncSummary, setCloudSyncSummary] = useState<Partial<CloudWorkspaceSnapshot>>({});

  // Sync hash route
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as ModuleRoute;
      const validRoutes: ModuleRoute[] = [
        'dashboard',
        'inventory',
        'expenses',
        'sales',
        'clients',
        'parts',
        'finance',
        'reports',
        'ideas',
        'team',
        'settings',
      ];
      if (validRoutes.includes(hash)) {
        setActiveRouteState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const setActiveRoute = (route: ModuleRoute) => {
    window.location.hash = route;
    setActiveRouteState(route);
  };

  // Apply CSS accent + RTL dir when settings change
  useEffect(() => {
    const accent = state.settings.accentColor || '#f17832';
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.dir = state.settings.language === 'ar' ? 'rtl' : 'ltr';
  }, [state.settings.accentColor, state.settings.language]);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveModal((prev) => (prev === 'command_search' ? null : 'command_search'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Track Firebase Auth state & attach Firestore listener only when authenticated
  useEffect(() => {
    let unsubCloud: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setIsAuthReady(true);
      if (unsubCloud) {
        unsubCloud();
        unsubCloud = null;
      }
      if (user && user.emailVerified) {
        try {
          await syncUserProfileToFirestore(user, state.settings.dealershipName);
          await syncDealershipWorkspaceToFirestore(user, state);
          unsubCloud = subscribeToCloudWorkspace(user, (patch) => {
            setCloudSyncSummary((prev) => ({ ...prev, ...patch }));
          });
        } catch (_err) {
          // Handled by handleFirestoreError
        }
      } else {
        setCloudSyncSummary({});
      }
    });
    return () => {
      unsubAuth();
      if (unsubCloud) unsubCloud();
    };
  }, []);

  // Auto-sync workspace summary to Firestore when state changes while authenticated
  useEffect(() => {
    if (!isHydrated || !isAuthReady || !firebaseUser || !firebaseUser.emailVerified) return;
    if (!state.settings.isOnline) return;
    const timer = setTimeout(() => {
      void syncDealershipWorkspaceToFirestore(firebaseUser, state).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [state, isHydrated, isAuthReady, firebaseUser]);

  const signInWithGoogle = async () => {
    try {
      const user = await signInWithGooglePopup();
      await syncUserProfileToFirestore(user, state.settings.dealershipName);
      await syncDealershipWorkspaceToFirestore(user, state);
      for (const v of state.vehicles) {
        await syncVehicleToFirestore(user, v);
      }
      await appendCloudSyncAuditLog(user, {
        title: 'Initial Google Sign-In & Full Workspace Sync',
        summary: `Authenticated ${user.email || user.uid} and synced ${state.vehicles.length} vehicles to Firestore.`,
        category: 'Firebase Cloud Sync',
        vehiclesCount: state.vehicles.length,
      });
      showToast(`Signed in as ${user.displayName || user.email} — Firestore Cloud Sync active.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In cancelled';
      showToast(`Firebase Auth: ${msg}`);
    }
  };

  const signOutGoogle = async () => {
    await signOutFirebaseUser();
    setCloudSyncSummary({});
    showToast('Signed out of Firebase User Session (Firestore DB active).');
  };

  const syncNowToFirebase = async () => {
    if (!firebaseUser) {
      await signInWithGoogle();
      return;
    }
    try {
      await syncUserProfileToFirestore(firebaseUser, state.settings.dealershipName);
      await syncDealershipWorkspaceToFirestore(firebaseUser, state);
      for (const v of state.vehicles) {
        await syncVehicleToFirestore(firebaseUser, v);
      }
      await appendCloudSyncAuditLog(firebaseUser, {
        title: 'Manual Dealership Cloud Sync',
        summary: `Manual sync pushed ${state.vehicles.length} vehicles and ${state.clients.length} CRM leads to Firestore.`,
        category: 'Firebase Cloud Sync',
        vehiclesCount: state.vehicles.length,
      });
      showToast(`Synced ${state.vehicles.length} vehicles & workspace to Firestore.`);
    } catch (_err) {
      showToast('Firestore sync encountered a permission or network error.');
    }
  };

  const openModal = (modal: ActiveModalType, payload: ModalContextPayload = {}) => {
    setModalPayload(payload);
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalPayload({});
  };

  const jumpToCommandPaletteResult = (item: CommandPaletteResultItem) => {
    if (item.category === 'inventory') {
      setSelectedVehicleId(item.recordId);
      setActiveRoute('inventory');
      showToast(`Jumped to Inventory: ${item.title}`);
    } else if (item.category === 'clients') {
      setSelectedClientId(item.recordId);
      setActiveRoute('clients');
      showToast(`Jumped to CRM Client: ${item.title}`);
    } else if (item.category === 'treasury') {
      const subType =
        item.subType === 'account' ||
        item.subType === 'debt' ||
        item.subType === 'audit_log'
          ? item.subType
          : 'transaction';
      setSelectedTreasuryTarget({
        id: item.recordId,
        subType,
        queryHint: item.treasuryTarget?.searchQuery || item.title,
      });
      setActiveRoute('finance');
      showToast(`Jumped to Treasury (${item.badgeText}): ${item.title}`);
    }
    closeModal();
  };

  const isSensitiveVisible = canViewSensitiveFinancials(state.settings.activeRole);
  const canMutate = canMutateWorkspace(state.settings.activeRole);

  const fmtMoney = (amountUsd: number, forceSensitiveCheck = false): string => {
    const masked = forceSensitiveCheck && !isSensitiveVisible;
    return formatMoney(amountUsd, state.settings.currency, masked);
  };

  // Helper to increment sync queue when offline
  const withSyncCounter = (nextState: DealershipState): DealershipState => {
    if (!nextState.settings.isOnline) {
      return {
        ...nextState,
        settings: {
          ...nextState.settings,
          queuedSyncCount: nextState.settings.queuedSyncCount + 1,
        },
      };
    }
    return nextState;
  };

  const addVehicle = (
    v: Omit<Vehicle, 'id' | 'daysInStock' | 'accruedHoldingCost'>,
    extraReconExpense = 0
  ): Vehicle => {
    const newId = `veh-${Date.now()}`;
    const diffMs = Date.now() - new Date(v.purchaseDate || Date.now()).getTime();
    const daysInStock = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    const newVehicle: Vehicle = {
      ...v,
      id: newId,
      daysInStock,
      accruedHoldingCost: Math.round(daysInStock * 6),
    };

    setState((prev) => {
      let updatedAccounts = updateAccountBalance(
        prev.accounts,
        v.paidFromAccountId,
        -v.purchasePrice
      );
      const newTx: LedgerTransaction = {
        id: `tx-${Date.now()}`,
        date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        accountId: v.paidFromAccountId,
        description: `Vehicle acquisition: ${v.year} ${v.make} ${v.model} (${v.stockId})`,
        source: 'Vehicle Purchase',
        category: 'Vehicle Acquisition',
        amount: v.purchasePrice,
        direction: 'Outflow',
        referenceId: newId,
      };

      const nextExpenses = [...prev.expenses];
      const nextTransactions = [newTx, ...prev.transactions];

      if (extraReconExpense > 0) {
        const expId = `exp-${Date.now() + 1}`;
        nextExpenses.unshift({
          id: expId,
          amount: extraReconExpense,
          date: new Date().toISOString().slice(0, 10),
          category: 'Detailing',
          type: 'Vehicle-linked',
          vehicleId: newId,
          teamMember: prev.settings.displayName,
          paidFromAccountId: v.paidFromAccountId,
          description: `Initial reconditioning / detailing (${v.stockId})`,
        });
        updatedAccounts = updateAccountBalance(
          updatedAccounts,
          v.paidFromAccountId,
          -extraReconExpense
        );
        nextTransactions.unshift({
          id: `tx-${Date.now() + 2}`,
          date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          accountId: v.paidFromAccountId,
          description: `Expense: Initial reconditioning (${v.stockId})`,
          source: 'Expense',
          category: 'Reconditioning & Detailing',
          amount: extraReconExpense,
          direction: 'Outflow',
          referenceId: expId,
        });
      }

      return withSyncCounter({
        ...prev,
        vehicles: [newVehicle, ...prev.vehicles],
        expenses: nextExpenses,
        accounts: updatedAccounts,
        transactions: nextTransactions,
      });
    });

    showToast(`Added ${v.year} ${v.make} ${v.model} (${v.stockId}) to Inventory.`);
    return newVehicle;
  };

  const updateVehicle = (id: string, patch: Partial<Vehicle>) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        vehicles: prev.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      })
    );
    showToast('Vehicle record updated.');
  };

  const addExpense = (e: Omit<Expense, 'id'>): Expense => {
    const newExp: Expense = { ...e, id: `exp-${Date.now()}` };
    setState((prev) => {
      const updatedAccounts = updateAccountBalance(
        prev.accounts,
        e.paidFromAccountId,
        -e.amount
      );
      const newTx: LedgerTransaction = {
        id: `tx-${Date.now()}`,
        date: `${e.date} 12:00`,
        accountId: e.paidFromAccountId,
        description: `Expense (${e.category}): ${e.description}`,
        source: 'Expense',
        category: autoCategorizeTransaction({
          source: 'Expense',
          description: `${e.category} ${e.description}`,
          direction: 'Outflow',
        }),
        amount: e.amount,
        direction: 'Outflow',
        referenceId: newExp.id,
      };
      return withSyncCounter({
        ...prev,
        expenses: [newExp, ...prev.expenses],
        accounts: updatedAccounts,
        transactions: [newTx, ...prev.transactions],
      });
    });
    showToast(`Logged ${fmtMoney(e.amount)} ${e.category} expense.`);
    return newExp;
  };

  const recordSale = (
    s: Omit<SaleRecord, 'id' | 'totalCostSnapshot' | 'netProfitSnapshot'>
  ): SaleRecord => {
    const targetVehicle = state.vehicles.find((v) => v.id === s.vehicleId);
    const totalCost = targetVehicle
      ? calculateVehicleTotalCost(targetVehicle, state.expenses)
      : 0;
    const netProfit = s.saleAmount - totalCost + (s.vatRefundAmount || 0);

    const newSale: SaleRecord = {
      ...s,
      id: `sale-${Date.now()}`,
      totalCostSnapshot: totalCost,
      netProfitSnapshot: netProfit,
    };

    setState((prev) => {
      const updatedVehicles = prev.vehicles.map((v) =>
        v.id === s.vehicleId
          ? {
              ...v,
              status: 'Sold' as const,
              soldDate: s.saleDate,
              soldPrice: s.saleAmount,
              vatRefundAmount: s.vatRefundAmount,
            }
          : v
      );
      const updatedAccounts = updateAccountBalance(
        prev.accounts,
        s.depositToAccountId,
        s.saleAmount
      );
      const newTx: LedgerTransaction = {
        id: `tx-${Date.now()}`,
        date: `${s.saleDate} 15:00`,
        accountId: s.depositToAccountId,
        description: `Sale proceeds: ${
          targetVehicle
            ? `${targetVehicle.year} ${targetVehicle.make} ${targetVehicle.model} (${targetVehicle.stockId})`
            : s.vehicleId
        } — ${s.buyerName}`,
        source: 'Vehicle Sale',
        category: 'Vehicle Sales Proceeds',
        amount: s.saleAmount,
        direction: 'Inflow',
        referenceId: newSale.id,
      };

      return withSyncCounter({
        ...prev,
        vehicles: updatedVehicles,
        sales: [newSale, ...prev.sales],
        accounts: updatedAccounts,
        transactions: [newTx, ...prev.transactions],
      });
    });

    showToast(`Sale recorded for ${s.buyerName} (${fmtMoney(s.saleAmount)}).`);
    return newSale;
  };

  const addClient = (c: Omit<ClientLead, 'id' | 'interactions'>): ClientLead => {
    const newClient: ClientLead = {
      ...c,
      id: `cli-${Date.now()}`,
      interactions: [
        {
          id: `int-${Date.now()}`,
          date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          author: state.settings.displayName,
          type: 'Note',
          note: `Lead created in stage "${c.stage}". ${c.request || ''}`,
        },
      ],
    };
    setState((prev) =>
      withSyncCounter({
        ...prev,
        clients: [newClient, ...prev.clients],
      })
    );
    showToast(`Added client ${c.name} to CRM.`);
    return newClient;
  };

  const updateClientStage = (clientId: string, stage: CrmStage) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                stage,
                interactions: [
                  {
                    id: `int-${Date.now()}`,
                    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
                    author: prev.settings.displayName,
                    type: 'Note',
                    note: `Pipeline stage updated to "${stage}".`,
                  },
                  ...c.interactions,
                ],
              }
            : c
        ),
      })
    );
    showToast(`Updated lead stage to ${stage}.`);
  };

  const addClientInteraction = (
    clientId: string,
    interaction: Omit<ClientInteraction, 'id' | 'date'>
  ) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                isOverdue: false,
                interactions: [
                  {
                    ...interaction,
                    id: `int-${Date.now()}`,
                    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
                  },
                  ...c.interactions,
                ],
              }
            : c
        ),
      })
    );
    showToast('Interaction logged to CRM timeline.');
  };

  const addClientDocument = (
    clientId: string,
    doc: Omit<ClientDocument, 'id' | 'clientId' | 'uploadedAt' | 'uploadedBy'>
  ): ClientDocument => {
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const newDoc: ClientDocument = {
      ...doc,
      id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      clientId,
      uploadedAt: nowStr,
      uploadedBy: state.settings.displayName,
    };

    setState((prev) =>
      withSyncCounter({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                documents: [newDoc, ...(c.documents || [])],
                interactions: [
                  {
                    id: `int-${Date.now()}`,
                    date: nowStr,
                    author: prev.settings.displayName,
                    type: 'Note',
                    note: `Attached secure KYC document [${doc.category}]: ${doc.name} (Local Object URL).`,
                  },
                  ...c.interactions,
                ],
              }
            : c
        ),
      })
    );

    showToast(`Attached ${doc.category} ("${doc.name}") via secure local Object URL.`);
    return newDoc;
  };

  const removeClientDocument = (clientId: string, documentId: string) => {
    const targetClient = state.clients.find((c) => c.id === clientId);
    const targetDoc = targetClient?.documents?.find((d) => d.id === documentId);
    if (
      targetDoc &&
      targetDoc.objectUrl &&
      targetDoc.objectUrl.startsWith('blob:') &&
      typeof URL !== 'undefined' &&
      typeof URL.revokeObjectURL === 'function'
    ) {
      try {
        URL.revokeObjectURL(targetDoc.objectUrl);
      } catch (_e) {
        // ignore if already revoked
      }
    }

    setState((prev) =>
      withSyncCounter({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                documents: (c.documents || []).filter((d) => d.id !== documentId),
              }
            : c
        ),
      })
    );

    showToast('Revoked local Object URL and purged client document.');
  };

  const toggleVerifyClientDocument = (clientId: string, documentId: string) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                documents: (c.documents || []).map((d) =>
                  d.id === documentId ? { ...d, verified: !d.verified } : d
                ),
              }
            : c
        ),
      })
    );
    showToast('Updated KYC document verification status.');
  };

  const addPartStock = (input: {
    existingPartId?: string;
    name: string;
    code: string;
    category: string;
    batchLabel: string;
    quantity: number;
    unitCost: number;
    purchaseDate: string;
    paidFromAccountId: string;
    invoiceScanUrl?: string;
    invoiceNumber?: string;
    vendorName?: string;
    scanDocType?: 'Service Invoice' | 'Vehicle Title';
  }) => {
    setState((prev) => {
      let partId = input.existingPartId;
      const nextParts = [...prev.parts];
      if (!partId) {
        partId = `part-${Date.now()}`;
        nextParts.push({
          id: partId,
          code: input.code,
          name: input.name,
          category: input.category,
        });
      }
      const newBatch: PartBatch = {
        id: `batch-${Date.now()}`,
        partId,
        batchLabel: input.batchLabel,
        purchaseDate: input.purchaseDate,
        initialQty: input.quantity,
        remainingQty: input.quantity,
        unitCost: input.unitCost,
        paidFromAccountId: input.paidFromAccountId,
        invoiceScanUrl: input.invoiceScanUrl,
        invoiceNumber: input.invoiceNumber,
        vendorName: input.vendorName,
        scanDocType: input.scanDocType,
      };
      const totalSpend = Number((input.quantity * input.unitCost).toFixed(2));
      const updatedAccounts = updateAccountBalance(
        prev.accounts,
        input.paidFromAccountId,
        -totalSpend
      );
      const newTx: LedgerTransaction = {
        id: `tx-${Date.now()}`,
        date: `${input.purchaseDate} 10:30`,
        accountId: input.paidFromAccountId,
        description: `FIFO Part Stock Purchase: ${input.quantity}x ${input.name} (${input.batchLabel})${
          input.invoiceNumber ? ` [Invoice #${input.invoiceNumber}]` : ''
        }`,
        source: 'Part',
        category: 'FIFO Part Stock Purchase',
        amount: totalSpend,
        direction: 'Outflow',
        referenceId: newBatch.id,
      };
      return withSyncCounter({
        ...prev,
        parts: nextParts,
        partBatches: [...prev.partBatches, newBatch],
        accounts: updatedAccounts,
        transactions: [newTx, ...prev.transactions],
      });
    });
    showToast(`Added ${input.quantity} units to FIFO Parts Inventory.`);
  };

  const attachScanToPartBatch = (
    batchId: string,
    scan: {
      invoiceScanUrl: string;
      invoiceNumber: string;
      vendorName: string;
      scanDocType: 'Service Invoice' | 'Vehicle Title';
    }
  ) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        partBatches: prev.partBatches.map((b) =>
          b.id === batchId
            ? {
                ...b,
                invoiceScanUrl: scan.invoiceScanUrl,
                invoiceNumber: scan.invoiceNumber,
                vendorName: scan.vendorName,
                scanDocType: scan.scanDocType,
              }
            : b
        ),
      })
    );
    showToast(
      `Attached scanned ${scan.scanDocType} (${scan.invoiceNumber}) to FIFO batch.`
    );
  };

  const batchImportPartsCsv = (
    items: CsvPartBatchInput[],
    paidFromAccountId: string,
    recordLedgerOutflow = true
  ) => {
    let totalSpend = 0;
    let totalUnits = 0;
    items.forEach((item) => {
      totalSpend += item.quantity * item.unitCost;
      totalUnits += item.quantity;
    });
    totalSpend = Number(totalSpend.toFixed(2));
    const importedBatchesCount = items.length;

    setState((prev) => {
      const nextParts = [...prev.parts];
      const nextBatches = [...prev.partBatches];
      const now = Date.now();

      items.forEach((item, idx) => {
        const normalizedCode = item.code.trim().toUpperCase();
        const normalizedName = item.name.trim();

        // Check if existing part matches by code or exact name
        let existingPart = nextParts.find(
          (p) =>
            p.code.trim().toUpperCase() === normalizedCode ||
            p.name.trim().toLowerCase() === normalizedName.toLowerCase()
        );

        let partId: string;
        if (existingPart) {
          partId = existingPart.id;
        } else {
          partId = `part-${now}-${idx}`;
          const newPart: PartItem = {
            id: partId,
            code: normalizedCode,
            name: normalizedName,
            category: item.category.trim() || 'General',
          };
          nextParts.push(newPart);
        }

        const purchaseDate =
          item.purchaseDate && /^\d{4}-\d{2}-\d{2}/.test(item.purchaseDate)
            ? item.purchaseDate
            : new Date().toISOString().slice(0, 10);

        const batchLabel =
          item.batchLabel?.trim() ||
          `BATCH-${purchaseDate.replace(/-/g, '')}-${String(idx + 1).padStart(2, '0')}`;

        const newBatch: PartBatch = {
          id: `batch-${now}-${idx}`,
          partId,
          batchLabel,
          purchaseDate,
          initialQty: item.quantity,
          remainingQty: item.quantity,
          unitCost: item.unitCost,
          paidFromAccountId,
        };

        nextBatches.push(newBatch);
      });

      let updatedAccounts = prev.accounts;
      let nextTransactions = prev.transactions;

      if (recordLedgerOutflow && totalSpend > 0) {
        updatedAccounts = updateAccountBalance(
          prev.accounts,
          paidFromAccountId,
          -totalSpend
        );
        const newTx: LedgerTransaction = {
          id: `tx-${now}`,
          date: `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          accountId: paidFromAccountId,
          description: `FIFO Part CSV Batch Import: ${items.length} batches (${totalUnits} units)`,
          source: 'Part',
          category: 'FIFO Part Stock Purchase',
          amount: totalSpend,
          direction: 'Outflow',
          referenceId: `csv-batch-${now}`,
        };
        nextTransactions = [newTx, ...prev.transactions];
      }

      return withSyncCounter({
        ...prev,
        parts: nextParts,
        partBatches: nextBatches,
        accounts: updatedAccounts,
        transactions: nextTransactions,
      });
    });

    return { importedBatchesCount, totalUnits, totalSpend };
  };

  const allocatePartToVehicle = (input: {
    partId: string;
    vehicleId: string;
    quantity: number;
    notes?: string;
  }) => {
    const part = state.parts.find((p) => p.id === input.partId);
    const vehicle = state.vehicles.find((v) => v.id === input.vehicleId);
    if (!part || !vehicle) return;

    const fifoResult = allocateFifoPartBatches(
      state.partBatches,
      input.partId,
      input.quantity
    );

    const newExp: Expense = {
      id: `exp-${Date.now()}`,
      amount: fifoResult.totalFifoCost,
      date: new Date().toISOString().slice(0, 10),
      category: 'Parts',
      type: 'Vehicle-linked',
      vehicleId: vehicle.id,
      teamMember: state.settings.displayName,
      paidFromAccountId: state.accounts[0]?.id || 'acc-bank',
      description: `FIFO Part Allocation: ${input.quantity}x ${part.name} (${fifoResult.allocations
        .map((a) => `${a.qtyUsed} from ${a.batchLabel} @ $${a.unitCost}`)
        .join(', ')})${input.notes ? ` — ${input.notes}` : ''}`,
      fifoPartCode: part.code,
    };

    setState((prev) =>
      withSyncCounter({
        ...prev,
        partBatches: fifoResult.updatedBatches,
        expenses: [newExp, ...prev.expenses],
      })
    );

    showToast(
      `Allocated ${input.quantity}x ${part.name} (${fmtMoney(fifoResult.totalFifoCost)} FIFO cost) to ${vehicle.stockId}.`
    );
  };

  const recordPartSale = (input: {
    partId: string;
    quantity: number;
    unitPrice: number;
    saleDate: string;
    buyer: string;
    phone: string;
    paymentMethod: PartSaleRecord['paymentMethod'];
    depositToAccountId: string;
  }) => {
    const part = state.parts.find((p) => p.id === input.partId);
    if (!part) return;

    const fifoResult = allocateFifoPartBatches(
      state.partBatches,
      input.partId,
      input.quantity
    );
    const totalRevenue = Number((input.quantity * input.unitPrice).toFixed(2));
    const grossProfit = Number((totalRevenue - fifoResult.totalFifoCost).toFixed(2));

    const newPartSale: PartSaleRecord = {
      id: `psale-${Date.now()}`,
      partId: part.id,
      partName: part.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      totalRevenue,
      fifoCost: fifoResult.totalFifoCost,
      grossProfit,
      saleDate: input.saleDate,
      buyer: input.buyer,
      phone: input.phone,
      paymentMethod: input.paymentMethod,
      depositToAccountId: input.depositToAccountId,
    };

    setState((prev) => {
      const updatedAccounts = updateAccountBalance(
        prev.accounts,
        input.depositToAccountId,
        totalRevenue
      );
      const newTx: LedgerTransaction = {
        id: `tx-${Date.now()}`,
        date: `${input.saleDate} 14:15`,
        accountId: input.depositToAccountId,
        description: `Counter Part Sale: ${input.quantity}x ${part.name} to ${input.buyer}`,
        source: 'Part',
        category: 'FIFO Part Sales',
        amount: totalRevenue,
        direction: 'Inflow',
        referenceId: newPartSale.id,
      };
      return withSyncCounter({
        ...prev,
        partBatches: fifoResult.updatedBatches,
        partSales: [newPartSale, ...prev.partSales],
        accounts: updatedAccounts,
        transactions: [newTx, ...prev.transactions],
      });
    });

    showToast(
      `Part sale recorded: ${fmtMoney(totalRevenue)} revenue (${fmtMoney(grossProfit)} FIFO profit).`
    );
  };

  const createReorderRequest = (
    partId: string,
    customQty?: number,
    notes?: string
  ) => {
    const req = generatePartReorderRequest(partId, state, customQty, notes);
    setState((prev) => ({
      ...prev,
      reorderRequests: [
        req,
        ...(prev.reorderRequests || []).filter(
          (r) => r.partId !== partId || r.status === 'Received'
        ),
      ],
    }));
    showToast(
      `Generated Reorder Request #${req.id} for ${req.suggestedQty} units of ${req.partName} (${fmtMoney(
        req.totalEstimatedCost
      )} estimated).`
    );
    return req;
  };

  const updateReorderRequestStatus = (
    requestId: string,
    status: 'Draft' | 'Ordered' | 'Received'
  ) => {
    setState((prev) => ({
      ...prev,
      reorderRequests: (prev.reorderRequests || []).map((r) =>
        r.id === requestId ? { ...r, status } : r
      ),
    }));
    showToast(`Updated reorder request status to "${status}".`);
  };

  const receiveReorderRequest = (
    requestId: string,
    paidFromAccountId?: string
  ) => {
    const req = (state.reorderRequests || []).find((r) => r.id === requestId);
    if (!req) return;

    const accountId =
      paidFromAccountId || state.accounts[0]?.id || 'acc-bank';
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    const newBatch: PartBatch = {
      id: `batch-${now}`,
      partId: req.partId,
      batchLabel: `PO-${req.id.replace(/^po-/i, '').toUpperCase()}`,
      purchaseDate: today,
      initialQty: req.suggestedQty,
      remainingQty: req.suggestedQty,
      unitCost: req.estimatedUnitCost,
      paidFromAccountId: accountId,
    };

    setState((prev) => {
      const updatedAccounts = updateAccountBalance(
        prev.accounts,
        accountId,
        -req.totalEstimatedCost
      );

      const newTx: LedgerTransaction = {
        id: `tx-${now}`,
        date: `${today} ${new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        accountId,
        description: `Received PO #${req.id}: ${req.suggestedQty}x ${req.partName}`,
        source: 'Part',
        category: 'FIFO Part Stock Purchase',
        amount: req.totalEstimatedCost,
        direction: 'Outflow',
        referenceId: req.id,
      };

      return withSyncCounter({
        ...prev,
        partBatches: [...prev.partBatches, newBatch],
        accounts: updatedAccounts,
        transactions: [newTx, ...prev.transactions],
        reorderRequests: (prev.reorderRequests || []).map((r) =>
          r.id === requestId ? { ...r, status: 'Received' as const } : r
        ),
      });
    });

    showToast(
      `Received PO #${req.id}: Added ${req.suggestedQty} units of ${req.partName} to FIFO Inventory.`
    );
  };

  const deleteReorderRequest = (requestId: string) => {
    setState((prev) => ({
      ...prev,
      reorderRequests: (prev.reorderRequests || []).filter(
        (r) => r.id !== requestId
      ),
    }));
    showToast('Dismissed reorder request.');
  };

  const addAccount = (acc: Omit<FinancialAccount, 'id' | 'balance'>) => {
    const newAcc: FinancialAccount = {
      ...acc,
      id: `acc-${Date.now()}`,
      balance: acc.startingBalance,
    };
    setState((prev) =>
      withSyncCounter({
        ...prev,
        accounts: [...prev.accounts, newAcc],
      })
    );
    showToast(`Added financial account "${acc.name}".`);
  };

  const addManualTransaction = (tx: {
    accountId: string;
    type: 'Deposit' | 'Withdrawal';
    amount: number;
    date: string;
    note: string;
  }) => {
    const delta = tx.type === 'Deposit' ? tx.amount : -tx.amount;
    setState((prev) => {
      const updatedAccounts = updateAccountBalance(prev.accounts, tx.accountId, delta);
      const newTx: LedgerTransaction = {
        id: `tx-${Date.now()}`,
        date: tx.date.replace('T', ' '),
        accountId: tx.accountId,
        description: tx.note || `Manual ${tx.type}`,
        source: 'Manual',
        category: tx.type === 'Deposit' ? 'Capital Deposit / Equity' : 'Other Outflow',
        amount: tx.amount,
        direction: tx.type === 'Deposit' ? 'Inflow' : 'Outflow',
      };
      return withSyncCounter({
        ...prev,
        accounts: updatedAccounts,
        transactions: [newTx, ...prev.transactions],
      });
    });
    showToast(`Recorded ${tx.type.toLowerCase()} of ${fmtMoney(tx.amount)}.`);
  };

  const addDebt = (
    d: Omit<DebtRecord, 'id' | 'paidAmount' | 'status' | 'isOverdue'>
  ) => {
    const isOverdue = new Date(d.dueDate).getTime() < Date.now();
    const newDebt: DebtRecord = {
      ...d,
      id: `debt-${Date.now()}`,
      paidAmount: 0,
      status: 'Open',
      isOverdue,
    };
    setState((prev) =>
      withSyncCounter({
        ...prev,
        debts: [newDebt, ...prev.debts],
      })
    );
    showToast(`Added balance for ${d.counterparty}.`);
  };

  const settleDebt = (debtId: string, amount: number, accountId: string) => {
    const targetDebt = state.debts.find((d) => d.id === debtId);
    if (!targetDebt || amount <= 0) return;

    const settledRecord = settleDebtRecord(targetDebt, amount);
    const actualSettledDelta = settledRecord.paidAmount - targetDebt.paidAmount;
    const accountDelta =
      targetDebt.direction === 'Owed to me' ? actualSettledDelta : -actualSettledDelta;

    setState((prev) => {
      const updatedAccounts = updateAccountBalance(
        prev.accounts,
        accountId,
        accountDelta
      );
      const newTx: LedgerTransaction = {
        id: `tx-${Date.now()}`,
        date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        accountId,
        description: `Debt settlement (${targetDebt.direction}): ${targetDebt.counterparty}`,
        source: 'Debt Settlement',
        amount: actualSettledDelta,
        direction: targetDebt.direction === 'Owed to me' ? 'Inflow' : 'Outflow',
        referenceId: debtId,
        category:
          targetDebt.direction === 'Owed to me'
            ? 'Debt Collection (Receivables)'
            : 'Debt Settlement (Payable)',
      };
      return withSyncCounter({
        ...prev,
        debts: prev.debts.map((d) => (d.id === debtId ? settledRecord : d)),
        accounts: updatedAccounts,
        transactions: [newTx, ...prev.transactions],
      });
    });

    showToast(
      `Recorded ${fmtMoney(actualSettledDelta)} settlement for ${targetDebt.counterparty}.`
    );
  };

  const recategorizeTransaction = (txId: string, category: string) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        transactions: prev.transactions.map((tx) =>
          tx.id === txId ? { ...tx, category } : tx
        ),
      })
    );
    showToast(`Transaction categorized as "${category}".`);
  };

  const reconcileTransaction = (
    txId: string,
    reconciled: boolean,
    bankReference?: string
  ) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        transactions: prev.transactions.map((tx) =>
          tx.id === txId
            ? {
                ...tx,
                reconciled,
                reconciledAt: reconciled
                  ? new Date().toISOString().slice(0, 16).replace('T', ' ')
                  : undefined,
                bankReference:
                  bankReference ||
                  tx.bankReference ||
                  (reconciled
                    ? `MATCH-${Date.now().toString().slice(-6)}`
                    : undefined),
              }
            : tx
        ),
      })
    );
    showToast(
      reconciled
        ? 'Transaction cleared and reconciled.'
        : 'Transaction marked unreconciled.'
    );
  };

  const autoCategorizeAllTransactions = (): number => {
    let updatedCount = 0;
    setState((prev) => {
      const updatedTx = prev.transactions.map((tx) => {
        if (
          !tx.category ||
          tx.category === 'Other' ||
          tx.category === 'Other Inflow' ||
          tx.category === 'Other Outflow'
        ) {
          const newCat = autoCategorizeTransaction(tx);
          if (newCat !== tx.category) {
            updatedCount++;
            return { ...tx, category: newCat };
          }
        }
        return tx;
      });
      return withSyncCounter({
        ...prev,
        transactions: updatedTx,
      });
    });
    showToast(`Auto-categorized ${updatedCount} transaction(s).`);
    return updatedCount;
  };

  const reconcileAllMatchedTransactions = (accountId: string): number => {
    let count = 0;
    setState((prev) => {
      const updatedTx = prev.transactions.map((tx) => {
        if (tx.accountId === accountId && !tx.reconciled) {
          count++;
          return {
            ...tx,
            reconciled: true,
            reconciledAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
            bankReference:
              tx.bankReference ||
              `AUTO-REC-${Math.floor(100000 + Math.random() * 900000)}`,
          };
        }
        return tx;
      });
      return withSyncCounter({
        ...prev,
        transactions: updatedTx,
      });
    });
    showToast(
      `Automated reconciliation: Cleared & reconciled ${count} transaction(s).`
    );
    return count;
  };

  // Treasury Audit Log (Voice Memos & Text Summaries)
  const addAuditLogEntry = (
    entry: Omit<TreasuryAuditLogEntry, 'id' | 'timestamp'>
  ): TreasuryAuditLogEntry => {
    const now = new Date();
    const formattedDate = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const newEntry: TreasuryAuditLogEntry = {
      ...entry,
      id: `audit-${Date.now()}`,
      timestamp: formattedDate,
    };
    setState((prev) =>
      withSyncCounter({
        ...prev,
        auditLogs: [newEntry, ...(prev.auditLogs || [])],
      })
    );
    showToast(`Saved to Treasury Audit Log: "${newEntry.title}"`);
    return newEntry;
  };

  const deleteAuditLogEntry = (id: string) => {
    setState((prev) =>
      withSyncCounter({
        ...prev,
        auditLogs: (prev.auditLogs || []).filter((l) => l.id !== id),
      })
    );
    showToast('Audit log record deleted.');
  };

  const addIdea = (title: string, details: string) => {
    const newIdea: IdeaItem = {
      id: `idea-${Date.now()}`,
      title,
      details,
      votes: 1,
      views: 1,
      upvotedByMe: true,
      status: 'Open',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setState((prev) =>
      withSyncCounter({
        ...prev,
        ideas: [newIdea, ...prev.ideas],
      })
    );
    showToast('Idea submitted to product roadmap.');
  };

  const toggleIdeaVote = (ideaId: string) => {
    setState((prev) => ({
      ...prev,
      ideas: prev.ideas.map((item) =>
        item.id === ideaId
          ? {
              ...item,
              upvotedByMe: !item.upvotedByMe,
              votes: item.upvotedByMe ? item.votes - 1 : item.votes + 1,
            }
          : item
      ),
    }));
  };

  const inviteTeamMember = (email: string, role: RoleType) => {
    const namePart = email.split('@')[0].replace(/[._]/g, ' ');
    const displayName = namePart
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const newMember: TeamMember = {
      id: `tm-${Date.now()}`,
      name: displayName || 'Invited Member',
      email,
      role,
      status: 'Invited',
      avatarIcon: 'Smile',
    };
    setState((prev) =>
      withSyncCounter({
        ...prev,
        teamMembers: [...prev.teamMembers, newMember],
      })
    );
    showToast(`Invitation sent to ${email} (${role}).`);
  };

  const setActiveRole = (role: RoleType) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        activeRole: role,
      },
    }));
    showToast(`Switched active workspace role to ${role}.`);
  };

  const updateSettings = (patch: Partial<WorkspaceSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch,
      },
    }));
    showToast('Settings saved.');
  };

  const toggleOnlineStatus = () => {
    setState((prev) => {
      const nextOnline = !prev.settings.isOnline;
      if (nextOnline && prev.settings.queuedSyncCount > 0) {
        setTimeout(() => {
          showToast(
            `Online sync restored — flushed ${prev.settings.queuedSyncCount} queued change(s).`
          );
        }, 50);
      }
      return {
        ...prev,
        settings: {
          ...prev.settings,
          isOnline: nextOnline,
          queuedSyncCount: nextOnline ? 0 : prev.settings.queuedSyncCount,
        },
      };
    });
  };

  const resetToDemoData = () => {
    void clearPersistence();
    setState(INITIAL_DEALERSHIP_STATE);
    setSelectedVehicleId(null);
    showToast('Workspace reset to factory pre-seeded demo data (Firebase Firestore reset).');
  };

  const applyPendingAiAction = (action: PendingActionPreview): string => {
    const snapshotId = `snap-${Date.now()}`;
    setUndoSnapshots((prev) => ({
      ...prev,
      [snapshotId]: JSON.parse(JSON.stringify(state)),
    }));

    const p = action.payload as Record<string, any>;
    if (action.actionType === 'create_vehicle') {
      addVehicle(
        {
          stockId: String(p.stockId || `CDT-${101 + state.vehicles.length}`),
          vin: String(p.vin || '1HGCV1F34LA099999'),
          year: Number(p.year || 2021),
          make: String(p.make || 'Toyota'),
          model: String(p.model || 'Camry'),
          trim: String(p.trim || 'SE'),
          color: String(p.color || 'Silver'),
          colorHex: '#94a3b8',
          engine: '2.5L Dynamic Force I4',
          drivetrain: 'FWD',
          mileage: Number(p.mileage || 38400),
          purchasePrice: Number(p.purchasePrice || 18000),
          askingPrice: Number(p.askingPrice || 22000),
          retailValue: Number(p.askingPrice || 22000) + 500,
          wholesaleValue: Number(p.purchasePrice || 18000) + 600,
          purchaseDate: new Date().toISOString().slice(0, 10),
          status: 'In prep',
          paidFromAccountId: String(p.paidFromAccountId || state.accounts[0]?.id || 'acc-bank'),
          coverPhoto: '/src/assets/images/car_honda_accord_1794267358981.jpg',
          bodyFuelNotes: '4D Sedan · Gasoline',
          notes: 'Created via Voice-to-Work AI Assistant.',
        },
        Number(p.extraExpenseAmount || 0)
      );
    } else if (action.actionType === 'create_expense') {
      addExpense({
        amount: Number(p.amount || 250),
        date: new Date().toISOString().slice(0, 10),
        category: (p.category as Expense['category']) || 'Transport',
        type: (p.type as Expense['type']) || 'General Overhead',
        vehicleId: p.vehicleId ? String(p.vehicleId) : undefined,
        teamMember: state.settings.displayName,
        paidFromAccountId: String(p.paidFromAccountId || state.accounts[0]?.id || 'acc-bank'),
        description: String(p.description || 'Voice-to-Work logged expense'),
      });
    } else if (action.actionType === 'record_sale') {
      recordSale({
        vehicleId: String(p.vehicleId || state.vehicles[0]?.id),
        saleAmount: Number(p.saleAmount || 21500),
        saleDate: new Date().toISOString().slice(0, 10),
        vatRefundPct: 0,
        vatRefundAmount: 0,
        buyerName: String(p.buyerName || 'Direct Walk-In Buyer'),
        buyerPhone: String(p.buyerPhone || '+1 (512) 555-0192'),
        paymentMethod: 'Bank Transfer',
        depositToAccountId: String(p.depositToAccountId || state.accounts[0]?.id || 'acc-bank'),
        notes: 'Recorded via Voice-to-Work AI Assistant.',
      });
    } else if (action.actionType === 'update_vehicle') {
      updateVehicle(String(p.vehicleId || state.vehicles[0]?.id), {
        askingPrice: Number(p.askingPrice || 21900),
        status: (p.status as Vehicle['status']) || 'Available',
      });
    } else if (action.actionType === 'add_debt') {
      addDebt({
        counterparty: String(p.counterparty || 'Counterparty'),
        direction: (p.direction as 'Owed to me' | 'I owe') || 'Owed to me',
        amount: Number(p.amount || 1000),
        date: String(p.date || new Date().toISOString().slice(0, 10)),
        dueDate: String(p.dueDate || '2026-11-25'),
        phone: String(p.phone || '+1 (512) 555-0190'),
        notes: String(p.notes || 'Logged via Voice-to-Work AI Assistant'),
      });
    }

    return snapshotId;
  };

  const undoAiSnapshot = (snapshotId: string): boolean => {
    const prior = undoSnapshots[snapshotId];
    if (!prior) return false;
    setState(prior);
    showToast('Reverted AI change — previous dealership state restored.');
    return true;
  };

  return (
    <DealershipContext.Provider
      value={{
        state,
        isHydrated,
        lastSyncedAt,
        activeRoute,
        setActiveRoute,
        selectedVehicleId,
        setSelectedVehicleId,
        selectedClientId,
        setSelectedClientId,
        selectedTreasuryTarget,
        setSelectedTreasuryTarget,
        jumpToCommandPaletteResult,
        activeModal,
        modalPayload,
        openModal,
        closeModal,
        isAssistantOpen,
        setIsAssistantOpen,
        toastMessage,
        showToast,
        firebaseUser,
        isAuthReady,
        cloudSyncSummary,
        signInWithGoogle,
        signOutGoogle,
        syncNowToFirebase,
        isSensitiveVisible,
        canMutate,
        fmtMoney,
        addVehicle,
        updateVehicle,
        addExpense,
        recordSale,
        addClient,
        updateClientStage,
        addClientInteraction,
        addClientDocument,
        removeClientDocument,
        toggleVerifyClientDocument,
        addPartStock,
        attachScanToPartBatch,
        batchImportPartsCsv,
        allocatePartToVehicle,
        recordPartSale,
        createReorderRequest,
        updateReorderRequestStatus,
        receiveReorderRequest,
        deleteReorderRequest,
        addAccount,
        addManualTransaction,
        addDebt,
        settleDebt,
        recategorizeTransaction,
        reconcileTransaction,
        autoCategorizeAllTransactions,
        reconcileAllMatchedTransactions,
        addAuditLogEntry,
        deleteAuditLogEntry,
        addIdea,
        toggleIdeaVote,
        inviteTeamMember,
        setActiveRole,
        updateSettings,
        toggleOnlineStatus,
        resetToDemoData,
        applyPendingAiAction,
        undoAiSnapshot,
      }}
    >
      {children}
    </DealershipContext.Provider>
  );
};

export function useDealership() {
  const ctx = useContext(DealershipContext);
  if (!ctx) {
    throw new Error('useDealership must be used inside DealershipProvider');
  }
  return ctx;
}
