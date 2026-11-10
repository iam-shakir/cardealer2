export type RoleType = 'Owner' | 'Admin' | 'Sales' | 'Viewer';

export type ModuleRoute =
  | 'dashboard'
  | 'inventory'
  | 'expenses'
  | 'sales'
  | 'clients'
  | 'parts'
  | 'finance'
  | 'reports'
  | 'ideas'
  | 'team'
  | 'settings';

export type VehicleStatus =
  | 'Owned'
  | 'In transit'
  | 'In prep'
  | 'Available'
  | 'Reserved'
  | 'Sold';

export type ExpenseCategory =
  | 'Repairs'
  | 'Detailing'
  | 'Transport'
  | 'Registration'
  | 'Parts'
  | 'Office'
  | 'Rent'
  | 'Marketing';

export type ExpenseType = 'Vehicle-linked' | 'General Overhead';

export type PaymentMethod =
  | 'Cash'
  | 'Bank Transfer'
  | 'Card'
  | 'Financed / Partial Receivable';

export type CrmStage =
  | 'New lead'
  | 'Contacted'
  | 'Viewing'
  | 'Negotiation'
  | 'Sold';

export type AccountType = 'Bank' | 'Cash' | 'Card' | 'Other';

export type TransactionSource =
  | 'Vehicle Purchase'
  | 'Vehicle Sale'
  | 'Expense'
  | 'Part'
  | 'Debt Settlement'
  | 'Manual';

export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'AED'
  | 'CAD'
  | 'BRL'
  | 'JPY'
  | 'INR'
  | 'KRW'
  | 'RUB'
  | 'TRY'
  | 'UZS';

export type LanguageCode =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ru'
  | 'ar';

export type ProfileIconName =
  | 'Car'
  | 'Crown'
  | 'Compass'
  | 'Star'
  | 'Bolt'
  | 'Briefcase'
  | 'Mountain'
  | 'Smile';

export interface Vehicle {
  id: string;
  stockId: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  color: string;
  colorHex: string;
  engine: string;
  drivetrain: string;
  mileage: number;
  purchasePrice: number;
  askingPrice: number;
  retailValue: number;
  wholesaleValue: number;
  purchaseDate: string;
  daysInStock: number;
  accruedHoldingCost: number;
  status: VehicleStatus;
  paidFromAccountId: string;
  coverPhoto: string;
  bodyFuelNotes: string;
  notes: string;
  soldDate?: string;
  soldPrice?: number;
  vatRefundAmount?: number;
}

export interface Expense {
  id: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
  type: ExpenseType;
  vehicleId?: string;
  teamMember: string;
  paidFromAccountId: string;
  description: string;
  receiptUrl?: string;
  fifoPartCode?: string;
}

export interface SaleRecord {
  id: string;
  vehicleId: string;
  saleAmount: number;
  saleDate: string;
  vatRefundPct: number;
  vatRefundAmount: number;
  buyerName: string;
  buyerPhone: string;
  paymentMethod: PaymentMethod;
  depositToAccountId: string;
  totalCostSnapshot: number;
  netProfitSnapshot: number;
  notes: string;
}

export interface ClientInteraction {
  id: string;
  date: string;
  author: string;
  type: 'Call' | 'WhatsApp' | 'Test Drive' | 'Offer' | 'Note';
  note: string;
}

export type ClientDocumentCategory =
  | 'Driver License'
  | 'Proof of Insurance'
  | 'Credit Application'
  | 'Bill of Sale / Contract'
  | 'Trade-In Title'
  | 'Other';

export interface ClientDocument {
  id: string;
  clientId: string;
  name: string;
  category: ClientDocumentCategory;
  mimeType: string;
  sizeBytes: number;
  objectUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  verified: boolean;
  isSessionObjectUrl?: boolean;
  securityNote?: string;
}

export interface ClientLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  stage: CrmStage;
  vehicleId?: string;
  preferredContactDate: string;
  isOverdue: boolean;
  request: string;
  notes: string;
  interactions: ClientInteraction[];
  documents?: ClientDocument[];
}

export interface DealProfitPartSelection {
  partId: string;
  quantity: number;
}

export interface DealProfitEstimateInput {
  salePrice: number;
  purchaseCost: number;
  existingReconCost: number;
  manualReconCost: number;
  selectedParts: DealProfitPartSelection[];
  fixedOverheadAllocation: number;
  overheadPackPct: number;
  holdingCostAllocation: number;
  vatOrDocFeeBenefit: number;
}

export interface DealProfitPartBreakdownItem {
  partId: string;
  partCode: string;
  partName: string;
  quantity: number;
  fifoTotalCost: number;
  effectiveUnitCost: number;
  batchSummary: string;
}

export interface DealProfitEstimateResult {
  salePrice: number;
  purchaseCost: number;
  existingReconCost: number;
  manualReconCost: number;
  fifoPartsReconCost: number;
  totalReconCost: number;
  fixedOverheadAllocation: number;
  variableOverheadCost: number;
  holdingCostAllocation: number;
  totalOverheadCost: number;
  totalAllInCost: number;
  vatOrDocFeeBenefit: number;
  estimatedNetProfit: number;
  netProfitMarginPct: number;
  roiPct: number;
  breakEvenPrice: number;
  target15MarginPrice: number;
  marginHealth: 'Strong' | 'Healthy' | 'Thin' | 'Loss';
  partsBreakdown: DealProfitPartBreakdownItem[];
}

export interface PartBatch {
  id: string;
  partId: string;
  batchLabel: string;
  purchaseDate: string;
  initialQty: number;
  remainingQty: number;
  unitCost: number;
  paidFromAccountId: string;
  invoiceScanUrl?: string;
  invoiceNumber?: string;
  vendorName?: string;
  scanDocType?: 'Service Invoice' | 'Vehicle Title';
}

export interface MonthlyAuditSummaryRow {
  month: string;
  monthKey: string;
  grossRevenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfitMarginPct: number;
  inventoryTurnoverRate: number;
  unitsSold: number;
  auditStatus: 'Reconciled' | 'Verified';
}

export interface PartItem {
  id: string;
  code: string;
  name: string;
  category: string;
}

export interface CsvPartBatchInput {
  code: string;
  name: string;
  category: string;
  batchLabel?: string;
  quantity: number;
  unitCost: number;
  purchaseDate?: string;
}

export interface PartSaleRecord {
  id: string;
  partId: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  totalRevenue: number;
  fifoCost: number;
  grossProfit: number;
  saleDate: string;
  buyer: string;
  phone: string;
  paymentMethod: PaymentMethod;
  depositToAccountId: string;
}

export interface PartReorderRequest {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  category: string;
  currentStock: number;
  suggestedQty: number;
  estimatedUnitCost: number;
  totalEstimatedCost: number;
  burnRateMonthly: number;
  runoutDays: number;
  urgency: 'Critical' | 'High' | 'Warning';
  status: 'Draft' | 'Ordered' | 'Received';
  createdAt: string;
  orderedAt?: string;
  supplierNotes?: string;
}

export interface FinancialAccount {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  startingBalance: number;
}

export type TransactionCategory =
  | 'Vehicle Sales Proceeds'
  | 'FIFO Part Sales'
  | 'Debt Collection (Receivables)'
  | 'Customer Down Payment'
  | 'Capital Deposit / Equity'
  | 'Vehicle Acquisition'
  | 'Reconditioning & Detailing'
  | 'Repairs & Mechanical'
  | 'Transport & Towing'
  | 'FIFO Part Stock Purchase'
  | 'Lot Lease & Facilities'
  | 'Debt Settlement (Payable)'
  | 'General Overhead'
  | 'Other';

export interface LedgerTransaction {
  id: string;
  date: string;
  accountId: string;
  description: string;
  source: TransactionSource;
  category?: string;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  referenceId?: string;
  reconciled?: boolean;
  reconciledAt?: string;
  bankReference?: string;
}

export interface TreasuryAuditLogEntry {
  id: string;
  timestamp: string;
  title: string;
  rawTranscript: string;
  summary: string;
  category?: string;
  author: string;
  status: 'verified' | 'flagged' | 'archived';
  relatedVehicleVinOrStock?: string;
  source: 'assistant_voice' | 'manual';
  financialImpact?: string;
}

export interface DebtRecord {
  id: string;
  counterparty: string;
  direction: 'Owed to me' | 'I owe';
  amount: number;
  paidAmount: number;
  date: string;
  dueDate: string;
  isOverdue: boolean;
  phone: string;
  notes: string;
  status: 'Open' | 'Partial' | 'Settled';
}

export interface IdeaItem {
  id: string;
  title: string;
  details: string;
  votes: number;
  views: number;
  upvotedByMe: boolean;
  status: 'Open' | 'Delivered';
  versionTag?: string;
  resolutionNote?: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  status: 'Active' | 'Invited';
  avatarIcon: ProfileIconName;
}

export interface WorkspaceSettings {
  displayName: string;
  email: string;
  dealershipName: string;
  profileIcon: ProfileIconName;
  activeRole: RoleType;
  plan: 'Starter Free' | 'Solo' | 'Dealership';
  promoCode: string;
  currency: CurrencyCode;
  language: LanguageCode;
  accentColor: string;
  dismissedVoiceBanner: boolean;
  isOnline: boolean;
  queuedSyncCount: number;
}

export interface DealershipState {
  vehicles: Vehicle[];
  expenses: Expense[];
  sales: SaleRecord[];
  clients: ClientLead[];
  parts: PartItem[];
  partBatches: PartBatch[];
  partSales: PartSaleRecord[];
  accounts: FinancialAccount[];
  transactions: LedgerTransaction[];
  debts: DebtRecord[];
  auditLogs: TreasuryAuditLogEntry[];
  ideas: IdeaItem[];
  reorderRequests: PartReorderRequest[];
  teamMembers: TeamMember[];
  settings: WorkspaceSettings;
}

export type AIActionType =
  | 'create_vehicle'
  | 'update_vehicle'
  | 'create_expense'
  | 'record_sale'
  | 'add_debt';

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface PendingActionPreview {
  id: string;
  actionType: AIActionType;
  targetTitle: string;
  summary: string;
  diffs: FieldDiff[];
  payload: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'cancelled' | 'undone';
}

export interface PendingAuditProposal {
  id: string;
  title: string;
  rawTranscript: string;
  summary: string;
  category: string;
  financialImpact?: string;
  relatedVehicleVinOrStock?: string;
  status: 'pending' | 'saved' | 'cancelled';
  savedLogId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  imagePreview?: string;
  pendingAction?: PendingActionPreview;
  undoSnapshotId?: string;
  isVoiceInput?: boolean;
  pendingAuditProposal?: PendingAuditProposal;
}
