import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Crown,
  Download,
  FileText,
  Filter,
  Landmark,
  Layers,
  Mic,
  Mountain,
  Play,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smile,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  Trash2,
  UserPlus,
  Zap,
} from 'lucide-react';
import { useDealership } from '../context/DealershipContext';
import {
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  calculateVehicleNetProfit,
  calculateVehicleTotalCost,
  generateMonthlyAuditReportCsv,
  generateMonthlyAuditSummaryRows,
} from '../utils/accounting';
import {
  CurrencyCode,
  LanguageCode,
  ProfileIconName,
  RoleType,
} from '../types';

export const FinanceView: React.FC = () => {
  const {
    state,
    openModal,
    fmtMoney,
    isSensitiveVisible,
    canMutate,
    setActiveRole,
    recategorizeTransaction,
    reconcileTransaction,
    autoCategorizeAllTransactions,
    reconcileAllMatchedTransactions,
    addAuditLogEntry,
    deleteAuditLogEntry,
    setIsAssistantOpen,
    showToast,
    selectedTreasuryTarget,
    setSelectedTreasuryTarget,
  } = useDealership();

  const [subTab, setSubTab] = useState<'Overview' | 'Ledger' | 'Debts'>('Overview');
  const [ledgerSection, setLedgerSection] = useState<'transactions' | 'audit_log'>('transactions');
  const [txSearch, setTxSearch] = useState('');
  const [txSourceFilter, setTxSourceFilter] = useState<string>('All');
  const [txDirectionFilter, setTxDirectionFilter] = useState<'All' | 'Inflow' | 'Outflow'>('All');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('All');
  const [txAccountFilter, setTxAccountFilter] = useState<string>('All');
  const [txReconcileFilter, setTxReconcileFilter] = useState<'All' | 'Reconciled' | 'Unreconciled'>('All');
  const [reconAccountId, setReconAccountId] = useState<string>('acc-bank');
  const [showReconModal, setShowReconModal] = useState<boolean>(false);
  const [statementEndingBalance, setStatementEndingBalance] = useState<number>(48500);

  // Treasury Audit Log state
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('All');
  const [showManualAuditModal, setShowManualAuditModal] = useState(false);
  const [manualAuditTitle, setManualAuditTitle] = useState('');
  const [manualAuditTranscript, setManualAuditTranscript] = useState('');
  const [manualAuditSummary, setManualAuditSummary] = useState('');
  const [manualAuditCategory, setManualAuditCategory] = useState('General Overhead');
  const [manualAuditImpact, setManualAuditImpact] = useState('');

  // Respond to Global Command Palette jumps into Treasury
  React.useEffect(() => {
    if (!selectedTreasuryTarget) return;
    if (selectedTreasuryTarget.subType === 'account') {
      setSubTab('Overview');
      setReconAccountId(selectedTreasuryTarget.id);
    } else if (selectedTreasuryTarget.subType === 'debt') {
      setSubTab('Debts');
    } else if (selectedTreasuryTarget.subType === 'audit_log') {
      setSubTab('Ledger');
      setLedgerSection('audit_log');
      setAuditCategoryFilter('All');
      setAuditSearch(selectedTreasuryTarget.queryHint || '');
    } else {
      setSubTab('Ledger');
      setLedgerSection('transactions');
      setTxSourceFilter('All');
      setTxDirectionFilter('All');
      setTxCategoryFilter('All');
      setTxAccountFilter('All');
      setTxReconcileFilter('All');
      setTxSearch(selectedTreasuryTarget.queryHint || '');
    }
    setSelectedTreasuryTarget(null);
  }, [selectedTreasuryTarget, setSelectedTreasuryTarget]);

  if (!isSensitiveVisible) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center max-w-xl mx-auto my-8 space-y-4">
        <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto" />
        <h1 className="text-lg font-bold text-slate-900">
          Finance &amp; Treasury Restricted ({state.settings.activeRole} Role)
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          Under Car Dealer Tracker&apos;s strict Role-Based Access Control (RBAC), bank balances, counterparty debts, and profit ledgers are hidden from <strong>Sales</strong> and <strong>Viewer</strong> roles.
        </p>
        <button
          type="button"
          onClick={() => setActiveRole('Owner')}
          style={{ backgroundColor: state.settings.accentColor }}
          className="px-4 py-2 rounded-md text-xs font-semibold text-white"
        >
          Switch to Owner Role to View Treasury
        </button>
      </div>
    );
  }

  const totalCash = state.accounts.reduce((s, a) => s + a.balance, 0);
  const receivables = state.debts
    .filter((d) => d.direction === 'Owed to me' && d.status !== 'Settled')
    .reduce((s, d) => s + (d.amount - d.paidAmount), 0);
  const payables = state.debts
    .filter((d) => d.direction === 'I owe' && d.status !== 'Settled')
    .reduce((s, d) => s + (d.amount - d.paidAmount), 0);
  const overdueTotal = state.debts
    .filter((d) => d.isOverdue && d.status !== 'Settled')
    .reduce((s, d) => s + (d.amount - d.paidAmount), 0);
  const settledTotal = state.debts.reduce((s, d) => s + d.paidAmount, 0);

  const filteredTx = state.transactions.filter(
    (t) => txSourceFilter === 'All' || t.source === txSourceFilter
  );

  const accountColors = ['#18181b', '#f17832', '#2563eb', '#10b981'];

  return (
    <div className="space-y-5">
      {/* Header & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Finance, Treasury &amp; Counterparty Balances
          </h1>
          <p className="text-xs text-slate-500">
            Live multi-account balances, automated ledger inflows/outflows, and debt settlement
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('add_account')}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Landmark className="w-3.5 h-3.5 text-[#f17832]" />
            <span>🏛 Add account</span>
          </button>
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('add_transaction')}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add transaction</span>
          </button>
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('add_debt')}
            style={{ backgroundColor: state.settings.accentColor }}
            className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add balance (Debt)</span>
          </button>
        </div>
      </div>

      {/* 3 Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-200/70 p-1 rounded-lg self-start max-w-full">
        {(
          [
            { id: 'Overview', label: 'Overview' },
            { id: 'Ledger', label: 'Treasury Ledger' },
            { id: 'Debts', label: 'Debts & Payments' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`px-3 sm:px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'Overview' && (
        <div className="space-y-5">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">
                Cash across accounts
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {fmtMoney(totalCash, true)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Across {state.accounts.length} active accounts
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">
                Owed to dealership (Receivables)
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600">
                {fmtMoney(receivables, true)}
              </div>
              <div className="mt-1 text-xs text-slate-500">Buyer notes &amp; credits</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">
                Dealership owes (Payables)
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {fmtMoney(payables, true)}
              </div>
              <div className="mt-1 text-xs text-slate-500">Vendor &amp; carrier bills</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">
                Overdue balances
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-600">
                {fmtMoney(overdueTotal, true)}
              </div>
              <div className="mt-1 text-xs text-slate-500">Past due date</div>
            </div>
          </div>

          {/* Capital Allocation Visual Bar */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">
                Capital Allocation Across Treasury Accounts
              </span>
              <span className="font-mono text-slate-500">
                Total Liquid: {fmtMoney(totalCash, true)}
              </span>
            </div>
            <div className="w-full h-4 rounded-md overflow-hidden flex bg-slate-100">
              {state.accounts.map((acc, idx) => {
                const pct =
                  totalCash > 0 ? Math.max(4, (acc.balance / totalCash) * 100) : 33;
                return (
                  <div
                    key={acc.id}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: accountColors[idx % accountColors.length],
                    }}
                    title={`${acc.name}: ${fmtMoney(acc.balance, true)}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600 font-mono tabular-nums">
              {state.accounts.map((acc, idx) => (
                <span key={acc.id} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs inline-block"
                    style={{
                      backgroundColor: accountColors[idx % accountColors.length],
                    }}
                  />
                  <span className="font-sans font-medium text-slate-800">
                    {acc.name}:
                  </span>
                  <span>{fmtMoney(acc.balance, true)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Account Cards Grid & Cash Movement Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 grid grid-cols-1 gap-3">
              {state.accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-white p-4 rounded-lg border border-slate-200 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {acc.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Type: {acc.type} · Starting: {fmtMoney(acc.startingBalance, true)}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-base font-bold text-slate-900">
                      {fmtMoney(acc.balance, true)}
                    </div>
                    <div className="text-[10px] text-emerald-600">Live Balance</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-7 bg-white p-5 rounded-lg border border-slate-200 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Cash Movement (Inflows vs. Outflows)
                </h3>
                <p className="text-xs text-slate-500">
                  Aggregate treasury movement from vehicle purchases, sales, and expenses
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 py-4 sm:py-6 items-end">
                <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200">
                  <div className="text-xs font-medium text-emerald-800">
                    Total Recorded Inflows
                  </div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700">
                    +
                    {fmtMoney(
                      state.transactions
                        .filter((t) => t.direction === 'Inflow')
                        .reduce((s, t) => s + t.amount, 0),
                      true
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-rose-50/70 border border-rose-200">
                  <div className="text-xs font-medium text-rose-800">
                    Total Recorded Outflows
                  </div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-rose-700">
                    -
                    {fmtMoney(
                      state.transactions
                        .filter((t) => t.direction === 'Outflow')
                        .reduce((s, t) => s + t.amount, 0),
                      true
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'Ledger' && (
        <div className="space-y-5">
          {/* Treasury Ledger Navigation Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#18181b] text-white">
                <Landmark className="w-4 h-4 text-[#f17832]" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Treasury Operating Ledger &amp; Audit Records
                </h2>
                <p className="text-[11px] text-slate-500">
                  Real-time cash movement ledger, automated reconciliation, and voice memo audit logs
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg self-start sm:self-auto max-w-full">
              <button
                type="button"
                onClick={() => setLedgerSection('transactions')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  ledgerSection === 'transactions'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Transactions &amp; Reconciliation ({state.transactions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setLedgerSection('audit_log')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  ledgerSection === 'audit_log'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mic className="w-3.5 h-3.5 text-[#f17832] shrink-0" />
                <span>Audit Log ({state.auditLogs?.length || 0})</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono font-bold">
                  Voice
                </span>
              </button>
            </div>
          </div>

          {ledgerSection === 'transactions' && (
            <div className="space-y-5">
              {/* Inflows & Outflows by Category Tracking Bar */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Inflows by Category */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-emerald-100 text-emerald-700">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Cash Inflows by Category
                    </h3>
                    <div className="text-[11px] text-slate-500">
                      Realized proceeds and capital receipts
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-sm font-bold text-emerald-600">
                    +
                    {fmtMoney(
                      state.transactions
                        .filter((t) => t.direction === 'Inflow')
                        .reduce((s, t) => s + t.amount, 0),
                      true
                    )}
                  </span>
                </div>
              </div>

              {/* Inflow categories list */}
              <div className="space-y-2 pt-1">
                {INFLOW_CATEGORIES.map((cat) => {
                  const catTxs = state.transactions.filter(
                    (t) => t.direction === 'Inflow' && (t.category === cat || (!t.category && cat === 'Other Inflow'))
                  );
                  const catTotal = catTxs.reduce((s, t) => s + t.amount, 0);
                  const totalInflows = state.transactions
                    .filter((t) => t.direction === 'Inflow')
                    .reduce((s, t) => s + t.amount, 0);
                  const pct = totalInflows > 0 ? Math.round((catTotal / totalInflows) * 100) : 0;
                  if (catTotal === 0 && pct === 0) return null;

                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{cat}</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {fmtMoney(catTotal, true)}{' '}
                          <span className="text-[11px] text-slate-400 font-normal">
                            ({pct}%)
                          </span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Outflows by Category */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-rose-100 text-rose-700">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Cash Outflows by Category
                    </h3>
                    <div className="text-[11px] text-slate-500">
                      Inventory acquisitions, recon &amp; facilities
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-sm font-bold text-rose-600">
                    -
                    {fmtMoney(
                      state.transactions
                        .filter((t) => t.direction === 'Outflow')
                        .reduce((s, t) => s + t.amount, 0),
                      true
                    )}
                  </span>
                </div>
              </div>

              {/* Outflow categories list */}
              <div className="space-y-2 pt-1">
                {OUTFLOW_CATEGORIES.map((cat) => {
                  const catTxs = state.transactions.filter(
                    (t) => t.direction === 'Outflow' && (t.category === cat || (!t.category && cat === 'Other Outflow'))
                  );
                  const catTotal = catTxs.reduce((s, t) => s + t.amount, 0);
                  const totalOutflows = state.transactions
                    .filter((t) => t.direction === 'Outflow')
                    .reduce((s, t) => s + t.amount, 0);
                  const pct = totalOutflows > 0 ? Math.round((catTotal / totalOutflows) * 100) : 0;
                  if (catTotal === 0 && pct === 0) return null;

                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{cat}</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {fmtMoney(catTotal, true)}{' '}
                          <span className="text-[11px] text-slate-400 font-normal">
                            ({pct}%)
                          </span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Automated Bank Reconciliation Module Card */}
          {(() => {
            const selectedAcc =
              state.accounts.find((a) => a.id === reconAccountId) || state.accounts[0];
            const accTxs = state.transactions.filter((t) => t.accountId === selectedAcc?.id);
            const reconciledTxs = accTxs.filter((t) => t.reconciled);
            const unreconciledTxs = accTxs.filter((t) => !t.reconciled);
            const clearedInflows = reconciledTxs
              .filter((t) => t.direction === 'Inflow')
              .reduce((s, t) => s + t.amount, 0);
            const clearedOutflows = reconciledTxs
              .filter((t) => t.direction === 'Outflow')
              .reduce((s, t) => s + t.amount, 0);
            const bookBalance = selectedAcc ? selectedAcc.balance : 0;
            const clearedBalance = (selectedAcc?.startingBalance || 0) + clearedInflows - clearedOutflows;
            const diff = Math.abs(bookBalance - statementEndingBalance);

            return (
              <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded bg-blue-50 text-blue-600">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">
                          Automated Bank Reconciliation
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                          LIVE ENGINE
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Match ledger transactions against bank feeds, verify statement balances, and clear settlements
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!canMutate}
                      onClick={() => autoCategorizeAllTransactions()}
                      className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 disabled:opacity-50"
                      title="Run heuristic rules to auto-categorize unclassified transactions"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Auto-Categorize All</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canMutate || unreconciledTxs.length === 0}
                      onClick={() => reconcileAllMatchedTransactions(selectedAcc?.id || 'acc-bank')}
                      style={{ backgroundColor: state.settings.accentColor }}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>⚡ Run Auto-Reconciliation</span>
                    </button>
                  </div>
                </div>

                {/* Account Selector & Summary Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Account to Reconcile
                    </label>
                    <select
                      value={reconAccountId}
                      onChange={(e) => {
                        setReconAccountId(e.target.value);
                        const acc = state.accounts.find((a) => a.id === e.target.value);
                        if (acc) setStatementEndingBalance(acc.balance);
                      }}
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1"
                    >
                      {state.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({fmtMoney(a.balance, true)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono tabular-nums">
                    <div className="text-[11px] font-sans font-medium text-slate-500">
                      Statement Balance
                    </div>
                    <div className="text-base font-bold text-slate-900 mt-1">
                      {fmtMoney(statementEndingBalance, true)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-sans">
                      Verified Bank Feed
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono tabular-nums">
                    <div className="text-[11px] font-sans font-medium text-slate-500">
                      Book Balance
                    </div>
                    <div className="text-base font-bold text-slate-900 mt-1">
                      {fmtMoney(bookBalance, true)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-sans">
                      Dealership General Ledger
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono tabular-nums">
                    <div className="text-[11px] font-sans font-medium text-slate-500">
                      Reconciled / Cleared
                    </div>
                    <div className="text-base font-bold text-emerald-600 mt-1">
                      {reconciledTxs.length}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({Math.round((reconciledTxs.length / (accTxs.length || 1)) * 100)}%)
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-sans">
                      {unreconciledTxs.length} pending clear
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-lg border font-mono tabular-nums ${
                      diff === 0
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : 'bg-amber-50/70 border-amber-200'
                    }`}
                  >
                    <div className="text-[11px] font-sans font-medium text-slate-600">
                      Difference / Status
                    </div>
                    <div
                      className={`text-base font-bold mt-1 ${
                        diff === 0 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {diff === 0 ? '$0.00' : fmtMoney(diff, true)}
                    </div>
                    <div
                      className={`text-[10px] font-sans font-semibold ${
                        diff === 0 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {diff === 0 ? '✓ Balanced & Reconciled' : 'Pending Verification'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Filter & Action Toolbar */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <input
              type="text"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="Search description, bank ref..."
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
            />

            <select
              value={txDirectionFilter}
              onChange={(e) => setTxDirectionFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
            >
              <option value="All">All Inflows &amp; Outflows</option>
              <option value="Inflow">Inflows Only (+)</option>
              <option value="Outflow">Outflows Only (-)</option>
            </select>

            <select
              value={txCategoryFilter}
              onChange={(e) => setTxCategoryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
            >
              <option value="All">All Categories</option>
              <optgroup label="Cash Inflow Categories">
                {INFLOW_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Cash Outflow Categories">
                {OUTFLOW_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            </select>

            <select
              value={txAccountFilter}
              onChange={(e) => setTxAccountFilter(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
            >
              <option value="All">All Accounts</option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              value={txReconcileFilter}
              onChange={(e) => setTxReconcileFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
            >
              <option value="All">All Statuses</option>
              <option value="Reconciled">✓ Reconciled Only</option>
              <option value="Unreconciled">⏳ Unreconciled (Pending)</option>
            </select>
          </div>

          {/* Treasury Ledger Table */}
          {(() => {
            const ledgerFiltered = state.transactions.filter((tx) => {
              const q = txSearch.trim().toLowerCase();
              const matchesSearch =
                !q ||
                tx.description.toLowerCase().includes(q) ||
                (tx.bankReference && tx.bankReference.toLowerCase().includes(q)) ||
                tx.source.toLowerCase().includes(q) ||
                (tx.category && tx.category.toLowerCase().includes(q));

              const matchesDirection =
                txDirectionFilter === 'All' || tx.direction === txDirectionFilter;

              const matchesCategory =
                txCategoryFilter === 'All' || tx.category === txCategoryFilter;

              const matchesAccount =
                txAccountFilter === 'All' || tx.accountId === txAccountFilter;

              const matchesReconcile =
                txReconcileFilter === 'All' ||
                (txReconcileFilter === 'Reconciled' ? tx.reconciled : !tx.reconciled);

              return (
                matchesSearch &&
                matchesDirection &&
                matchesCategory &&
                matchesAccount &&
                matchesReconcile
              );
            });

            return (
              <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left border-collapse">
                  <thead>
                    <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">DATE</th>
                      <th className="py-3 px-4">ACCOUNT</th>
                      <th className="py-3 px-4">DESCRIPTION &amp; BANK REF</th>
                      <th className="py-3 px-4">CATEGORY</th>
                      <th className="py-3 px-4">STATUS</th>
                      <th className="py-3 px-4 text-right">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {ledgerFiltered.map((tx) => {
                      const acc = state.accounts.find((a) => a.id === tx.accountId);
                      const isReconciled = Boolean(tx.reconciled);

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {tx.date}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            {acc?.name || tx.accountId}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">
                              {tx.description}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-slate-500">
                              <span>Src: {tx.source}</span>
                              {tx.bankReference && (
                                <>
                                  <span>·</span>
                                  <span className="text-slate-600 font-semibold bg-slate-100 px-1.5 py-0.2 rounded">
                                    Ref: {tx.bankReference}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={tx.category || (tx.direction === 'Inflow' ? 'Other Inflow' : 'Other Outflow')}
                              disabled={!canMutate}
                              onChange={(e) => recategorizeTransaction(tx.id, e.target.value)}
                              className="px-2 py-1 rounded text-xs font-medium border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white text-slate-800"
                              title="Click to recategorize this transaction"
                            >
                              {tx.direction === 'Inflow' ? (
                                INFLOW_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))
                              ) : (
                                OUTFLOW_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))
                              )}
                            </select>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={!canMutate}
                              onClick={() => reconcileTransaction(tx.id, !isReconciled)}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                                isReconciled
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              }`}
                              title={
                                isReconciled
                                  ? `Reconciled ${tx.reconciledAt || ''}. Click to un-clear.`
                                  : 'Click to clear and reconcile this transaction'
                              }
                            >
                              {isReconciled ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Reconciled</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Pending Clear</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                              tx.direction === 'Inflow'
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {tx.direction === 'Inflow' ? '+' : '-'}
                            {fmtMoney(tx.amount, true)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
            </div>
          )}

          {/* Treasury Audit Log Section (Voice Memos & AI Summaries) */}
          {ledgerSection === 'audit_log' && (
            <div className="space-y-5">
              {/* Audit Log Overview KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs font-medium text-slate-500">
                    Total Audit Records
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {(state.auditLogs || []).length}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Chronological audit ledger entries
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs font-medium text-slate-500">
                    Voice Dictated Memos
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#f17832] flex items-center gap-1.5">
                    <Mic className="w-5 h-5 text-[#f17832]" />
                    <span>
                      {(state.auditLogs || []).filter((l) => l.source === 'assistant_voice').length}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Transcribed &amp; controller summarized
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs font-medium text-slate-500">
                    Status Verification
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600">
                    {(state.auditLogs || []).filter((l) => l.status === 'verified').length}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    100% verified controller records
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs font-medium text-slate-500">
                    Financial Impact Traced
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-blue-600">
                    {(state.auditLogs || []).filter((l) => l.financialImpact).length}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Linked to lot cash movements
                  </div>
                </div>
              </div>

              {/* Audit Log Filter & Quick Action Bar */}
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5">
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search title, transcript, summary, category, vehicle..."
                    className="w-full sm:w-72 px-3 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:border-[#f17832]"
                  />
                  <select
                    value={auditCategoryFilter}
                    onChange={(e) => setAuditCategoryFilter(e.target.value)}
                    className="w-full sm:w-52 px-3 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:border-[#f17832]"
                  >
                    <option value="All">All Categories ({state.auditLogs?.length || 0})</option>
                    {Array.from(
                      new Set((state.auditLogs || []).map((l) => l.category).filter(Boolean))
                    ).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowManualAuditModal((p) => !p)}
                    className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-800 flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Manual Audit Note</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAssistantOpen(true)}
                    style={{ backgroundColor: state.settings.accentColor }}
                    className="px-3.5 py-1.5 rounded-md font-semibold text-white flex items-center gap-1.5 hover:opacity-95 transition-opacity shadow-xs"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>🎙️ Speak Audit Memo (AI)</span>
                  </button>
                </div>
              </div>

              {/* Optional Manual Audit Form Drawer */}
              {showManualAuditModal && (
                <div className="bg-white p-4 rounded-lg border-2 border-amber-300 shadow-md space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                      <FileText className="w-4 h-4 text-[#f17832]" />
                      <span>Record Manual Audit Entry to Treasury Ledger</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowManualAuditModal(false)}
                      className="text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Audit Headline / Title
                      </label>
                      <input
                        type="text"
                        value={manualAuditTitle}
                        onChange={(e) => setManualAuditTitle(e.target.value)}
                        placeholder="e.g. Audit Note: Showroom AC Repair Invoice"
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded focus:border-[#f17832] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Category
                      </label>
                      <select
                        value={manualAuditCategory}
                        onChange={(e) => setManualAuditCategory(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded focus:border-[#f17832] focus:outline-none bg-white"
                      >
                        <option value="Vehicle Acquisition">Vehicle Acquisition</option>
                        <option value="Reconditioning & Detailing">
                          Reconditioning &amp; Detailing
                        </option>
                        <option value="Repairs & Mechanical">Repairs &amp; Mechanical</option>
                        <option value="Transport & Towing">Transport &amp; Towing</option>
                        <option value="FIFO Part Stock Purchase">
                          FIFO Part Stock Purchase
                        </option>
                        <option value="Lot Lease & Facilities">Lot Lease &amp; Facilities</option>
                        <option value="Debt Settlement">Debt Settlement</option>
                        <option value="Sales Proceeds">Sales Proceeds</option>
                        <option value="FIFO Part Sales">FIFO Part Sales</option>
                        <option value="Cash Movement">Cash Movement</option>
                        <option value="General Overhead">General Overhead</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Financial Impact (Optional)
                      </label>
                      <input
                        type="text"
                        value={manualAuditImpact}
                        onChange={(e) => setManualAuditImpact(e.target.value)}
                        placeholder="e.g. -$450.00 cash outflow"
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded focus:border-[#f17832] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Dictated / Raw Spoken Note
                    </label>
                    <input
                      type="text"
                      value={manualAuditTranscript}
                      onChange={(e) => setManualAuditTranscript(e.target.value)}
                      placeholder="Verbatim lot notes or spoken context..."
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded focus:border-[#f17832] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Executive Audit Summary
                    </label>
                    <textarea
                      rows={2}
                      value={manualAuditSummary}
                      onChange={(e) => setManualAuditSummary(e.target.value)}
                      placeholder="Controller audit summary explaining reconciliation status or risk..."
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded focus:border-[#f17832] focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowManualAuditModal(false)}
                      className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!manualAuditTitle.trim() || !manualAuditSummary.trim()}
                      onClick={() => {
                        addAuditLogEntry({
                          title: manualAuditTitle.trim(),
                          rawTranscript:
                            manualAuditTranscript.trim() || manualAuditTitle.trim(),
                          summary: manualAuditSummary.trim(),
                          category: manualAuditCategory,
                          author: `${state.settings.displayName} (${state.settings.activeRole})`,
                          status: 'verified',
                          source: 'manual',
                          financialImpact: manualAuditImpact.trim() || undefined,
                        });
                        setManualAuditTitle('');
                        setManualAuditTranscript('');
                        setManualAuditSummary('');
                        setManualAuditImpact('');
                        setShowManualAuditModal(false);
                      }}
                      style={{ backgroundColor: state.settings.accentColor }}
                      className="px-4 py-1.5 rounded text-white font-semibold hover:opacity-95 disabled:opacity-50"
                    >
                      Save Audit Log Entry
                    </button>
                  </div>
                </div>
              )}

              {/* Audit Log Chronological Entries */}
              {(() => {
                const logs = (state.auditLogs || []).filter((log) => {
                  const q = auditSearch.trim().toLowerCase();
                  const matchesSearch =
                    !q ||
                    log.title.toLowerCase().includes(q) ||
                    log.rawTranscript.toLowerCase().includes(q) ||
                    log.summary.toLowerCase().includes(q) ||
                    (log.category && log.category.toLowerCase().includes(q)) ||
                    (log.author && log.author.toLowerCase().includes(q)) ||
                    (log.relatedVehicleVinOrStock &&
                      log.relatedVehicleVinOrStock.toLowerCase().includes(q));

                  const matchesCategory =
                    auditCategoryFilter === 'All' || log.category === auditCategoryFilter;

                  return matchesSearch && matchesCategory;
                });

                if (logs.length === 0) {
                  return (
                    <div className="bg-white rounded-lg border border-slate-200 p-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-amber-50 text-[#f17832] mx-auto flex items-center justify-center">
                        <Mic className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">
                        No Treasury Audit Logs Found
                      </h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Speak lot updates into the Voice to Work Assistant drawer to generate
                        structured controller summaries and persist them directly into this
                        audit ledger.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsAssistantOpen(true)}
                        style={{ backgroundColor: state.settings.accentColor }}
                        className="px-4 py-2 rounded-md text-xs font-semibold text-white inline-flex items-center gap-1.5 hover:opacity-95 shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Open Assistant to Dictate Audit Memo</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 shadow-xs hover:border-slate-300 transition-colors"
                      >
                        {/* Top Metadata Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-500 font-medium">
                              {log.timestamp}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              {log.category || 'General Audit'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 flex items-center gap-1">
                              {log.source === 'assistant_voice' ? (
                                <>
                                  <Mic className="w-3 h-3 text-[#f17832]" />
                                  <span>Voice Assistant</span>
                                </>
                              ) : (
                                <span>Manual Entry</span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">
                              ✓ Verified
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(log.summary);
                                showToast('Audit summary copied to clipboard.');
                              }}
                              className="p-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-600"
                              title="Copy summary"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            {canMutate && (
                              <button
                                type="button"
                                onClick={() => deleteAuditLogEntry(log.id)}
                                className="p-1 rounded border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                                title="Delete audit record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className="text-sm font-bold text-slate-900">{log.title}</h4>

                        {/* Spoken Voice Transcript Block */}
                        <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900 text-[11px] uppercase tracking-wide">
                            <Mic className="w-3 h-3 text-[#f17832]" />
                            <span>Spoken Voice Dictation (Verbatim)</span>
                          </div>
                          <p className="italic text-slate-800 leading-relaxed">
                            &ldquo;{log.rawTranscript}&rdquo;
                          </p>
                        </div>

                        {/* Structured AI Controller Summary */}
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px] uppercase tracking-wide">
                            <Sparkles className="w-3 h-3 text-[#f17832]" />
                            <span>Executive Controller Audit Summary</span>
                          </div>
                          <p className="text-slate-800 font-medium leading-relaxed">
                            {log.summary}
                          </p>
                        </div>

                        {/* Footer details */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                          <div className="flex items-center gap-3">
                            {log.financialImpact && (
                              <span className="font-mono font-bold text-emerald-700">
                                Impact: {log.financialImpact}
                              </span>
                            )}
                            {log.relatedVehicleVinOrStock && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold">
                                🚗 Stock: {log.relatedVehicleVinOrStock}
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400">
                            Logged by: <strong>{log.author}</strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {subTab === 'Debts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">
                Total Receivables (Owed to me)
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-600">
                {fmtMoney(receivables, true)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">
                Total Payables (I owe)
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-rose-600">
                {fmtMoney(payables, true)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">Overdue</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-600">
                {fmtMoney(overdueTotal, true)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500">
                Settled / Paid
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                {fmtMoney(settledTotal, true)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead>
                <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">COUNTERPARTY</th>
                  <th className="py-3 px-4">DIRECTION</th>
                  <th className="py-3 px-4">DUE DATE</th>
                  <th className="py-3 px-4 text-right">ORIGINAL</th>
                  <th className="py-3 px-4 text-right">REMAINING</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {state.debts.map((debt) => {
                  const remaining = debt.amount - debt.paidAmount;
                  return (
                    <tr key={debt.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">
                          {debt.counterparty}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {debt.phone} · {debt.notes}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={
                            debt.direction === 'Owed to me'
                              ? 'text-emerald-700 font-semibold'
                              : 'text-rose-700 font-semibold'
                          }
                        >
                          {debt.direction}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <span
                          className={
                            debt.isOverdue && debt.status !== 'Settled'
                              ? 'text-rose-600 font-bold'
                              : 'text-slate-700'
                          }
                        >
                          {debt.dueDate}{' '}
                          {debt.isOverdue && debt.status !== 'Settled'
                            ? '(OVERDUE)'
                            : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {fmtMoney(debt.amount, true)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                        {fmtMoney(remaining, true)} ({debt.status})
                      </td>
                      <td className="py-3 px-4 text-right">
                        {debt.status !== 'Settled' ? (
                          <button
                            type="button"
                            disabled={!canMutate}
                            onClick={() =>
                              openModal('settle_debt', { debtId: debt.id })
                            }
                            className="px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold"
                          >
                            Record Partial/Full Settlement
                          </button>
                        ) : (
                          <span className="text-emerald-600 font-semibold">
                            ✓ Settled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const ReportsView: React.FC = () => {
  const { state, openModal, fmtMoney, isSensitiveVisible, showToast } =
    useDealership();

  const [dateRange, setDateRange] = useState<string>('All time');
  const ranges = [
    'Right now',
    '7 days',
    '30 days',
    '3 months',
    '6 months',
    'All time',
  ];

  const totalRevenue = state.sales.reduce((s, r) => s + r.saleAmount, 0);
  const totalProfit = state.sales.reduce((s, r) => s + r.netProfitSnapshot, 0);
  const marginPct =
    totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
  const activeStock = state.vehicles.filter((v) => v.status !== 'Sold');
  const avgDaysHeld =
    activeStock.length > 0
      ? Math.round(
          activeStock.reduce((s, v) => s + v.daysInStock, 0) / activeStock.length
        )
      : 0;
  const soldLeads = state.clients.filter((c) => c.stage === 'Sold').length;
  const crmConversionPct =
    state.clients.length > 0
      ? Math.round((soldLeads / state.clients.length) * 100)
      : 0;

  // Aging buckets
  const age0to30 = activeStock.filter((v) => v.daysInStock <= 30).length;
  const age31to60 = activeStock.filter(
    (v) => v.daysInStock > 30 && v.daysInStock <= 60
  ).length;
  const age61to90 = activeStock.filter(
    (v) => v.daysInStock > 60 && v.daysInStock <= 90
  ).length;
  const age90Plus = activeStock.filter((v) => v.daysInStock > 90).length;

  const [isAuditPdfModalOpen, setIsAuditPdfModalOpen] = useState(false);

  const auditSummary = useMemo(
    () => generateMonthlyAuditSummaryRows(state),
    [state]
  );

  // Expense breakdown by category
  const expenseByCategory = Array.from(
    state.expenses.reduce((map, e) => {
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  const handleExportCsvReport = () => {
    const csvContent = generateMonthlyAuditReportCsv(
      state,
      !isSensitiveVisible
    );
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.settings.dealershipName.replace(/\s+/g, '_')}_Monthly_Revenue_Profit_Audit_${dateRange.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      'Downloaded External Audit CSV (Monthly Revenue, Profit Margins & Unit Ledger).'
    );
  };

  const handleDownloadAuditPdfFile = () => {
    const { rows, totals } = auditSummary;
    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${state.settings.dealershipName} — External Audit Monthly Revenue & Profit Margin Report</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #0f172a; margin: 32px; background: #fff; }
    .header { background: #18181b; color: #fff; padding: 24px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 20px; font-weight: 800; margin: 0; }
    .subtitle { font-size: 12px; color: #a1a1aa; margin-top: 4px; font-family: monospace; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 20px 0; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; background: #f8fafc; }
    .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .kpi-val { font-size: 20px; font-weight: 800; font-family: monospace; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th { background: #18181b; color: #e4e4e7; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace; }
    tfoot td { background: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a; }
    .right { text-align: right; }
    .profit { color: #059669; font-weight: 700; }
    .signoff { margin-top: 28px; padding: 16px; border: 1px dashed #94a3b8; border-radius: 8px; font-size: 11px; color: #475569; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${state.settings.dealershipName} — External Audit Financial Summary</div>
      <div class="subtitle">Monthly Revenue, COGS, Net Profit Margin % &amp; Inventory Turnover · Period: ${dateRange}</div>
    </div>
    <div style="text-align:right;font-family:monospace;font-size:11px;">
      <div>Prepared By: ${state.settings.displayName} (${state.settings.activeRole})</div>
      <div>Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</div>
    </div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">6-Mo Gross Revenue</div><div class="kpi-val">${fmtMoney(totals.totalRevenue)}</div></div>
    <div class="kpi"><div class="kpi-label">6-Mo Net Realized Profit</div><div class="kpi-val profit">${fmtMoney(totals.totalGrossProfit, true)}</div></div>
    <div class="kpi"><div class="kpi-label">Weighted Profit Margin</div><div class="kpi-val">${isSensitiveVisible ? `${totals.weightedMarginPct}%` : 'MASKED'}</div></div>
    <div class="kpi"><div class="kpi-label">Avg Annualized Turnover</div><div class="kpi-val">${totals.avgTurnoverRate}x / yr</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th class="right">Units Sold</th>
        <th class="right">Gross Revenue</th>
        <th class="right">COGS (Vehicle + FIFO)</th>
        <th class="right">Realized Net Profit</th>
        <th class="right">Profit Margin %</th>
        <th class="right">Operating Expenses</th>
        <th class="right">Turnover Rate</th>
        <th>Audit Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td>${r.month}</td>
        <td class="right">${r.unitsSold}</td>
        <td class="right">${fmtMoney(r.grossRevenue)}</td>
        <td class="right">${fmtMoney(r.cogs, true)}</td>
        <td class="right profit">${fmtMoney(r.grossProfit, true)}</td>
        <td class="right">${isSensitiveVisible ? `${r.netProfitMarginPct}%` : 'MASKED'}</td>
        <td class="right">${fmtMoney(r.operatingExpenses)}</td>
        <td class="right">${r.inventoryTurnoverRate}x</td>
        <td>✓ ${r.auditStatus}</td>
      </tr>`
        )
        .join('')}
    </tbody>
    <tfoot>
      <tr>
        <td>6-MONTH AUDIT TOTAL / WEIGHTED AVG</td>
        <td class="right">${totals.totalUnitsSold}</td>
        <td class="right">${fmtMoney(totals.totalRevenue)}</td>
        <td class="right">${fmtMoney(totals.totalCogs, true)}</td>
        <td class="right profit">${fmtMoney(totals.totalGrossProfit, true)}</td>
        <td class="right">${isSensitiveVisible ? `${totals.weightedMarginPct}%` : 'MASKED'}</td>
        <td class="right">${fmtMoney(totals.totalExpenses)}</td>
        <td class="right">${totals.avgTurnoverRate}x</td>
        <td>✓ Verified</td>
      </tr>
    </tfoot>
  </table>
  <div class="signoff">
    <div><strong>Accounting Basis:</strong> Unified "One Profit Everywhere" Vehicle Total Cost + Chronological FIFO Parts Depletion</div>
    <div><strong>Controller / External Auditor Sign-off:</strong> ___________________________</div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.settings.dealershipName.replace(/\s+/g, '_')}_External_Audit_Summary_2026.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      'Downloaded formatted External Auditor Monthly Revenue & Profit Margin Report.'
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Analytics &amp; Executive Reports
          </h1>
          <p className="text-xs text-slate-500">
            Monthly revenue &amp; profit margin external audit exports, unit economics, aging distribution, and CRM funnel conversion
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 shrink-0 max-w-full">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg overflow-x-auto max-w-full no-scrollbar">
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDateRange(r)}
                className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                  dateRange === r
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsvReport}
              className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Audit CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAuditPdfModalOpen(true)}
              style={{ backgroundColor: state.settings.accentColor }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export / Preview Audit PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* External Audit Monthly Revenue & Profit Margin Summary Card */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-4 sm:px-5 py-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                External Audit Summary — Monthly Revenue &amp; Profit Margin Ledger
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ✓ GAAP / FIFO Reconciled
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              6-month monthly revenue, COGS, realized net profit, profit margin %, and annualized inventory turnover prepared for external auditing
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsvReport}
              className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-100 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Monthly CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAuditPdfModalOpen(true)}
              style={{ backgroundColor: state.settings.accentColor }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Auditor PDF Dossier</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600 tracking-wider">
                <th className="py-3 px-4">Month / Period</th>
                <th className="py-3 px-4 text-right">Units Sold</th>
                <th className="py-3 px-4 text-right">Gross Revenue</th>
                <th className="py-3 px-4 text-right">COGS (Vehicle + FIFO)</th>
                <th className="py-3 px-4 text-right">Realized Net Profit</th>
                <th className="py-3 px-4 text-right">Profit Margin %</th>
                <th className="py-3 px-4 text-right">Operating Expenses</th>
                <th className="py-3 px-4 text-right">Turnover (Ann.)</th>
                <th className="py-3 px-4 text-center">Audit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {auditSummary.rows.map((row) => (
                <tr key={row.monthKey} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-sans font-bold text-slate-900">
                    {row.month}{' '}
                    <span className="font-mono text-[11px] font-normal text-slate-400">
                      ({row.monthKey})
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">
                    {row.unitsSold}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    {fmtMoney(row.grossRevenue)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {fmtMoney(row.cogs, true)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-600">
                    +{fmtMoney(row.grossProfit, true)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                      {isSensitiveVisible
                        ? `${row.netProfitMarginPct}%`
                        : 'MASKED'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {fmtMoney(row.operatingExpenses)}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-700 font-semibold">
                    {row.inventoryTurnoverRate}x
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{row.auditStatus}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-mono font-bold tabular-nums text-xs">
                <td className="py-3.5 px-4 font-sans">
                  6-MONTH AUDIT TOTAL / WEIGHTED AVG
                </td>
                <td className="py-3.5 px-4 text-right">
                  {auditSummary.totals.totalUnitsSold}
                </td>
                <td className="py-3.5 px-4 text-right text-amber-300">
                  {fmtMoney(auditSummary.totals.totalRevenue)}
                </td>
                <td className="py-3.5 px-4 text-right text-zinc-300">
                  {fmtMoney(auditSummary.totals.totalCogs, true)}
                </td>
                <td className="py-3.5 px-4 text-right text-emerald-400">
                  +{fmtMoney(auditSummary.totals.totalGrossProfit, true)}
                </td>
                <td className="py-3.5 px-4 text-right text-emerald-300">
                  {isSensitiveVisible
                    ? `${auditSummary.totals.weightedMarginPct}%`
                    : 'MASKED'}
                </td>
                <td className="py-3.5 px-4 text-right text-zinc-200">
                  {fmtMoney(auditSummary.totals.totalExpenses)}
                </td>
                <td className="py-3.5 px-4 text-right text-blue-300">
                  {auditSummary.totals.avgTurnoverRate}x / yr
                </td>
                <td className="py-3.5 px-4 text-center font-sans text-[11px] text-emerald-400">
                  ✓ Verified
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Sales Revenue</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
            {fmtMoney(totalRevenue)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Recorded Profit</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-600">
            {fmtMoney(totalProfit, true)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {isSensitiveVisible ? `Margin: ${marginPct}%` : 'Masked'}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Expenses</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
            {fmtMoney(totalExpenses)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Days in Stock (Avg)</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
            {avgDaysHeld} days
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">CRM Conversion %</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-blue-600">
            {crmConversionPct}%
          </div>
        </div>
      </div>

      {/* Widget 1: Combined Performance Chart (Revenue, Profit & Expenses Trend) */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Performance Chart (Combined Revenue, Profit &amp; Expenses Trend)
            </h2>
            <p className="text-xs text-slate-500">
              Period comparison across {dateRange}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-800 inline-block" />
              <span>Revenue ({fmtMoney(totalRevenue)})</span>
            </span>
            {isSensitiveVisible && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                <span>Profit ({fmtMoney(totalProfit, true)})</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#f17832] inline-block" />
              <span>Expenses ({fmtMoney(totalExpenses)})</span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:gap-4 items-end h-28 pt-2 px-1 sm:px-3 border-b border-slate-200">
          {[
            { m: 'Jun', rev: 18400, prof: 3100, exp: 1450 },
            { m: 'Jul', rev: 22900, prof: 4250, exp: 1820 },
            { m: 'Aug', rev: 19500, prof: 3400, exp: 1610 },
            { m: 'Sep', rev: 27400, prof: 5120, exp: 2100 },
            { m: 'Oct', rev: 25200, prof: 4900, exp: 1950 },
            { m: 'Nov', rev: 21600, prof: 4460, exp: 2220 },
          ].map((item) => (
            <div key={item.m} className="flex flex-col items-center gap-1">
              <div className="flex items-end justify-center gap-1 sm:gap-1.5 h-20 w-full">
                <div
                  style={{ height: `${Math.round((item.rev / 28000) * 76)}px` }}
                  className="w-2 sm:w-4 bg-slate-800 rounded-t"
                />
                {isSensitiveVisible && (
                  <div
                    style={{ height: `${Math.round((item.prof / 28000) * 76)}px` }}
                    className="w-2 sm:w-4 bg-emerald-500 rounded-t"
                  />
                )}
                <div
                  style={{ height: `${Math.round((item.exp / 28000) * 76)}px` }}
                  className="w-2 sm:w-3 bg-[#f17832] rounded-t"
                />
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {item.m}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Remaining 4 Analytical Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Widget 2: Inventory Aging Distribution Donut */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Inventory Aging Distribution
            </h2>
            <p className="text-xs text-slate-500">
              Active stock broken down by holding period buckets
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-around gap-4 sm:gap-6 py-2">
            {/* SVG Donut representation */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#e2e8f0"
                  strokeWidth="3.8"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="3.8"
                  strokeDasharray="75 25"
                  strokeDashoffset="0"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#ef4444"
                  strokeWidth="3.8"
                  strokeDasharray="25 75"
                  strokeDashoffset="-75"
                />
              </svg>
              <div className="absolute text-center font-mono">
                <div className="text-lg font-bold text-slate-900">
                  {activeStock.length}
                </div>
                <div className="text-[10px] text-slate-500">In Stock</div>
              </div>
            </div>

            <div className="space-y-2 text-xs font-mono tabular-nums">
              <div className="flex items-center justify-between gap-6">
                <span className="font-sans text-slate-600">0–30 days (Fresh):</span>
                <strong className="text-emerald-600">{age0to30} units</strong>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="font-sans text-slate-600">31–60 days (Watch):</span>
                <strong className="text-amber-600">{age31to60} units</strong>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="font-sans text-slate-600">61–90 days:</span>
                <strong className="text-rose-600">{age61to90} units</strong>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="font-sans text-slate-600">90+ days:</span>
                <strong className="text-rose-700">{age90Plus} units</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Widget 2: Cost Control Widget */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Cost Control (Expense Categories Eating Margin)
            </h2>
            <p className="text-xs text-slate-500">
              Ranked categories by total expenditure
            </p>
          </div>
          <div className="space-y-3 text-xs">
            {expenseByCategory.map(([cat, amt]) => {
              const pct =
                totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span className="font-sans font-semibold text-slate-800">
                      {cat}
                    </span>
                    <span>
                      {fmtMoney(amt)} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${pct}%`,
                        backgroundColor: state.settings.accentColor,
                      }}
                      className="h-full rounded"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Widget 3: Deal Performance Widget (Top Vehicles by Gross Profit) */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Deal Performance (Ranked by Net Profit)
            </h2>
            <p className="text-xs text-slate-500">
              Realized and projected unit profitability across the lot
            </p>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {state.vehicles
              .map((v) => ({
                vehicle: v,
                profit: calculateVehicleNetProfit(v, state.expenses, state.sales),
                cost: calculateVehicleTotalCost(v, state.expenses),
              }))
              .sort((a, b) => b.profit - a.profit)
              .slice(0, 5)
              .map(({ vehicle, profit, cost }) => (
                <div
                  key={vehicle.id}
                  className="py-2.5 flex items-center justify-between font-mono tabular-nums"
                >
                  <div>
                    <div className="font-sans font-bold text-slate-900">
                      {vehicle.year} {vehicle.make} {vehicle.model} (
                      {vehicle.stockId})
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Status: {vehicle.status} · Cost: {fmtMoney(cost, true)}
                    </div>
                  </div>
                  <div className="text-right font-bold text-emerald-600">
                    +{fmtMoney(profit, true)}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Widget 4: CRM Pipeline Funnel */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              CRM Pipeline Conversion Funnel
            </h2>
            <p className="text-xs text-slate-500">
              Lead distribution across the 5 buyer stages
            </p>
          </div>
          <div className="space-y-3 text-xs">
            {(
              ['New lead', 'Contacted', 'Viewing', 'Negotiation', 'Sold'] as const
            ).map((stage) => {
              const count = state.clients.filter((c) => c.stage === stage).length;
              const pct =
                state.clients.length > 0
                  ? Math.round((count / state.clients.length) * 100)
                  : 0;
              return (
                <div key={stage} className="space-y-1">
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span className="font-sans font-medium text-slate-800">
                      {stage}
                    </span>
                    <span>
                      {count} leads ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded bg-slate-100 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(8, pct)}%` }}
                      className="h-full bg-slate-800 rounded"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* EXTERNAL AUDITOR PDF REPORT PREVIEW & EXPORT MODAL */}
      {isAuditPdfModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
          onClick={() => setIsAuditPdfModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#18181b] text-white px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#f17832] flex items-center justify-center text-white shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    External Audit Dossier — Monthly Revenue &amp; Profit Margin Report
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono truncate">
                    {state.settings.dealershipName} · Prepared by {state.settings.displayName} ({state.settings.activeRole})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditPdfModalOpen(false)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0"
              >
                <RotateCcw className="w-4 h-4 hidden" />
                <span className="text-xs font-bold px-1">✕</span>
              </button>
            </div>

            {/* Printable Auditor Dossier Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono">
                <div>
                  <div className="text-[10px] font-sans font-bold uppercase text-slate-500">
                    6-Mo Gross Revenue
                  </div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {fmtMoney(auditSummary.totals.totalRevenue)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-sans font-bold uppercase text-slate-500">
                    6-Mo Realized Net Profit
                  </div>
                  <div className="text-lg font-bold text-emerald-600 mt-0.5">
                    +{fmtMoney(auditSummary.totals.totalGrossProfit, true)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-sans font-bold uppercase text-slate-500">
                    Weighted Profit Margin %
                  </div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">
                    {isSensitiveVisible
                      ? `${auditSummary.totals.weightedMarginPct}%`
                      : 'MASKED'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-sans font-bold uppercase text-slate-500">
                    Avg Annualized Turnover
                  </div>
                  <div className="text-lg font-bold text-blue-700 mt-0.5">
                    {auditSummary.totals.avgTurnoverRate}x / yr
                  </div>
                </div>
              </div>

              {/* Monthly Schedule Table */}
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 font-bold text-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span>Schedule A: Monthly Revenue, COGS &amp; Profit Margin Summary (Jun – Nov 2026)</span>
                  <span className="font-mono text-[11px] text-emerald-700">✓ Reconciled with Treasury Ledger</span>
                </div>
                <table className="w-full min-w-[620px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2.5 px-3">Month</th>
                      <th className="py-2.5 px-3 text-right">Units</th>
                      <th className="py-2.5 px-3 text-right">Gross Revenue</th>
                      <th className="py-2.5 px-3 text-right">COGS</th>
                      <th className="py-2.5 px-3 text-right">Net Profit</th>
                      <th className="py-2.5 px-3 text-right">Margin %</th>
                      <th className="py-2.5 px-3 text-right">OpEx</th>
                      <th className="py-2.5 px-3 text-right">Turnover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {auditSummary.rows.map((r) => (
                      <tr key={r.monthKey}>
                        <td className="py-2 px-3 font-sans font-semibold text-slate-900">{r.month}</td>
                        <td className="py-2 px-3 text-right">{r.unitsSold}</td>
                        <td className="py-2 px-3 text-right font-semibold">{fmtMoney(r.grossRevenue)}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{fmtMoney(r.cogs, true)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600">+{fmtMoney(r.grossProfit, true)}</td>
                        <td className="py-2 px-3 text-right font-bold">{isSensitiveVisible ? `${r.netProfitMarginPct}%` : 'MASKED'}</td>
                        <td className="py-2 px-3 text-right">{fmtMoney(r.operatingExpenses)}</td>
                        <td className="py-2 px-3 text-right text-blue-700">{r.inventoryTurnoverRate}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Auditor Certification Note */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-dashed border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
                <div>
                  <strong>Audit Trail Verification:</strong> Every figure traces directly to a VIN-level acquisition, vehicle-linked reconditioning receipt, chronological FIFO part batch, or settled sale record.
                </div>
                <div className="font-mono text-slate-800 font-bold shrink-0">
                  CERTIFIED READY FOR EXTERNAL AUDIT
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsAuditPdfModalOpen(false)}
                className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
              >
                Close Preview
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsvReport}
                  className="px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Audit CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Print / Save as PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAuditPdfFile}
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded-md text-xs font-bold text-white flex items-center gap-1.5 shadow-sm hover:opacity-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Standalone Audit Report</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const IdeasView: React.FC = () => {
  const { state, openModal, toggleIdeaVote, canMutate } = useDealership();

  const openIdeas = state.ideas.filter((i) => i.status === 'Open');
  const deliveredIdeas = state.ideas.filter((i) => i.status === 'Delivered');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Ideas &amp; Feature Voting Roadmap
          </h1>
          <p className="text-xs text-slate-500">
            Vote on upcoming dealer workflow tools and inspect shipped v2.5.0 engineering notes
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs font-mono tabular-nums text-slate-600">
            OPEN: <strong>{openIdeas.length}</strong> · DELIVERED:{' '}
            <strong className="text-emerald-600">{deliveredIdeas.length}</strong>
          </div>
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('new_idea')}
            style={{ backgroundColor: state.settings.accentColor }}
            className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Idea</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Ideas */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            Open Feature Requests ({openIdeas.length})
          </h2>
          {openIdeas.map((idea) => (
            <div
              key={idea.id}
              className="bg-white p-4 rounded-lg border border-slate-200 flex items-start justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="font-bold text-sm text-slate-900">
                  {idea.title}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {idea.details}
                </p>
                <div className="text-[11px] font-mono text-slate-400">
                  Proposed {idea.createdAt} · {idea.views} views
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleIdeaVote(idea.id)}
                className={`px-3 py-2 rounded-md border text-xs font-mono font-bold tabular-nums flex flex-col items-center shrink-0 transition-colors ${
                  idea.upvotedByMe
                    ? 'bg-orange-50 border-[#f17832] text-[#f17832]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                aria-label={`Upvote ${idea.title}`}
              >
                <ThumbsUp className="w-3.5 h-3.5 mb-0.5" />
                <span>{idea.votes}</span>
              </button>
            </div>
          ))}
        </div>

        {/* Delivered Features */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            Delivered in v2.0–v2.5 ({deliveredIdeas.length})
          </h2>
          {deliveredIdeas.map((idea) => (
            <div
              key={idea.id}
              className="bg-white p-4 rounded-lg border border-slate-200 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">
                  {idea.title}
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-600">
                  Shipped {idea.versionTag} ({idea.votes} votes)
                </span>
              </div>
              <p className="text-xs text-slate-600">{idea.details}</p>
              {idea.resolutionNote && (
                <div className="p-2.5 rounded bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900">
                  <strong>Engineering Resolution:</strong> {idea.resolutionNote}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const TeamView: React.FC = () => {
  const { state, openModal, setActiveRole, canMutate } = useDealership();

  const roles: RoleType[] = ['Owner', 'Admin', 'Sales', 'Viewer'];
  const activeCount = state.teamMembers.filter(
    (m) => m.status === 'Active'
  ).length;
  const invitedCount = state.teamMembers.filter(
    (m) => m.status === 'Invited'
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Team &amp; Role-Based Access Control (RBAC)
          </h1>
          <p className="text-xs text-slate-500">
            Manage dealership staff seats and test live financial masking across roles
          </p>
        </div>
        <button
          type="button"
          disabled={!canMutate}
          onClick={() => openModal('invite_member')}
          style={{ backgroundColor: state.settings.accentColor }}
          className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 self-start hover:opacity-95 disabled:opacity-50"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Invite member</span>
        </button>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Team Seats</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {state.teamMembers.length} / 10
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Active</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600">
            {activeCount}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Invited</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-600">
            {invitedCount}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500">Your Active Role</div>
          <div className="mt-1 text-2xl font-bold text-[#f17832]">
            {state.settings.activeRole}
          </div>
        </div>
      </div>

      {/* Interactive Role Switcher for Demo Testing */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Interactive RBAC Role Simulator
          </h2>
          <p className="text-xs text-slate-500">
            Switch your active session role below to immediately test how <strong>Sales</strong> and <strong>Viewer</strong> mask purchase prices, wholesale values, net profit, margins, and treasury accounts across the entire application.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {roles.map((r) => {
            const active = state.settings.activeRole === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setActiveRole(r)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  active
                    ? 'border-[#f17832] bg-orange-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">{r}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {r === 'Owner' || r === 'Admin'
                    ? 'Full cost, profit & treasury access'
                    : r === 'Sales'
                    ? 'Masks purchase cost, profit & bank balances'
                    : 'Read-only + masks all sensitive financials'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Team Members Directory & Permission Matrix Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-[#18181b] text-white text-xs font-bold">
            Dealership Roster ({state.teamMembers.length})
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {state.teamMembers.map((tm) => (
              <div
                key={tm.id}
                className="p-3.5 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-900">{tm.name}</div>
                  <div className="text-slate-500 font-mono text-[11px]">
                    {tm.email}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-800">{tm.role}</div>
                  <div className="text-[11px] text-slate-400">{tm.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[540px] text-left border-collapse">
            <thead>
              <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">CAPABILITY DOMAIN</th>
                <th className="py-3 px-4">OWNER</th>
                <th className="py-3 px-4">ADMIN</th>
                <th className="py-3 px-4">SALES</th>
                <th className="py-3 px-4">VIEWER</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  Operations (Inventory, CRM, Expenses)
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Read / Write
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Read / Write
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Read / Write
                </td>
                <td className="py-3 px-4 text-slate-500">Read Only</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  Parts Inventory (FIFO Allocation)
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Read / Write
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Read / Write
                </td>
                <td className="py-3 px-4 text-blue-700 font-medium">
                  Allocate / Sell
                </td>
                <td className="py-3 px-4 text-slate-500">Read Only</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  Financial Visibility (Purchase Cost, Profit, Treasury)
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Full Access
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Full Access
                </td>
                <td className="py-3 px-4 text-rose-600 font-semibold">
                  Masked / Hidden
                </td>
                <td className="py-3 px-4 text-rose-600 font-semibold">
                  Masked / Hidden
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  Administration (Team, Plan, Branding)
                </td>
                <td className="py-3 px-4 text-emerald-700 font-medium">
                  Full Control
                </td>
                <td className="py-3 px-4 text-blue-700 font-medium">
                  Manage Team
                </td>
                <td className="py-3 px-4 text-slate-400">None</td>
                <td className="py-3 px-4 text-slate-400">None</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const {
    state,
    updateSettings,
    resetToDemoData,
    fmtMoney,
    isSensitiveVisible,
    showToast,
  } = useDealership();

  const [displayName, setDisplayName] = useState(state.settings.displayName);
  const [email, setEmail] = useState(state.settings.email);
  const [dealershipName, setDealershipName] = useState(
    state.settings.dealershipName
  );
  const [promoCode, setPromoCode] = useState(state.settings.promoCode);
  const [selectedMcpTool, setSelectedMcpTool] = useState<string>(
    'get_inventory_summary'
  );
  const [mcpOutput, setMcpOutput] = useState<string>('');

  const profileIcons: Array<{
    name: ProfileIconName;
    icon: React.FC<{ className?: string }>;
  }> = [
    { name: 'Car', icon: Car },
    { name: 'Crown', icon: Crown },
    { name: 'Compass', icon: Compass },
    { name: 'Star', icon: Star },
    { name: 'Bolt', icon: Zap },
    { name: 'Briefcase', icon: Briefcase },
    { name: 'Mountain', icon: Mountain },
    { name: 'Smile', icon: Smile },
  ];

  const currencies: Array<{ code: CurrencyCode; label: string }> = [
    { code: 'USD', label: 'USD $' },
    { code: 'EUR', label: 'EUR €' },
    { code: 'GBP', label: 'GBP £' },
    { code: 'AED', label: 'AED د.إ' },
    { code: 'CAD', label: 'CAD $' },
    { code: 'BRL', label: 'BRL R$' },
    { code: 'JPY', label: 'JPY ¥' },
    { code: 'INR', label: 'INR ₹' },
    { code: 'KRW', label: 'KRW ₩' },
    { code: 'RUB', label: 'RUB ₽' },
    { code: 'TRY', label: 'TRY ₺' },
    { code: 'UZS', label: 'UZS soʻm' },
  ];

  const languages: Array<{ code: LanguageCode; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'pt', label: 'Português' },
    { code: 'ru', label: 'Русский' },
    { code: 'ar', label: 'العربية (RTL)' },
  ];

  const runMcpToolTester = () => {
    const activeUnits = state.vehicles.filter((v) => v.status !== 'Sold');
    let resultPayload: unknown = {};

    if (selectedMcpTool === 'get_inventory_summary') {
      resultPayload = {
        dealership: state.settings.dealershipName,
        unitsInStock: activeUnits.length,
        aged45PlusDays: activeUnits.filter((v) => v.daysInStock >= 45).length,
        totalAskingValue: activeUnits.reduce((s, v) => s + v.askingPrice, 0),
      };
    } else if (selectedMcpTool === 'list_vehicles') {
      resultPayload = activeUnits.map((v) => ({
        stockId: v.stockId,
        vin: v.vin,
        title: `${v.year} ${v.make} ${v.model} ${v.trim}`,
        status: v.status,
        askingPrice: v.askingPrice,
      }));
    } else if (selectedMcpTool === 'get_profit_summary') {
      resultPayload = isSensitiveVisible
        ? {
            completedSales: state.sales.length,
            grossRevenue: state.sales.reduce((s, r) => s + r.saleAmount, 0),
            realizedNetProfit: state.sales.reduce(
              (s, r) => s + r.netProfitSnapshot,
              0
            ),
          }
        : { error: 'RBAC_FORBIDDEN: Active role cannot inspect profit summary' };
    } else if (selectedMcpTool === 'list_debts') {
      resultPayload = isSensitiveVisible
        ? state.debts
        : { error: 'RBAC_FORBIDDEN: Active role cannot inspect debts' };
    } else if (selectedMcpTool === 'get_accounts_overview') {
      resultPayload = isSensitiveVisible
        ? state.accounts
        : { error: 'RBAC_FORBIDDEN: Active role cannot inspect treasury accounts' };
    }

    setMcpOutput(
      JSON.stringify(
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: `tools/call (${selectedMcpTool})`,
          result: resultPayload,
        },
        null,
        2
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Settings, Branding &amp; MCP Connector
          </h1>
          <p className="text-xs text-slate-500">
            Configure profile, currency, RTL localization, custom report accent color, and AI agent tools
          </p>
        </div>
        <button
          type="button"
          onClick={resetToDemoData}
          className="px-3.5 py-2 rounded-md border border-rose-300 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-800 flex items-center gap-1.5 self-start"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Demo Data</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Dealer Profile &amp; Identity
            </h2>
            <span className="font-mono text-xs text-[#f17832] font-semibold">
              Role: {state.settings.activeRole}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Dealership Organization Name
              </label>
              <input
                type="text"
                value={dealershipName}
                onChange={(e) => setDealershipName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-200"
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">
              Select Profile Icon
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {profileIcons.map(({ name, icon: Icon }) => {
                const selected = state.settings.profileIcon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => updateSettings({ profileIcon: name })}
                    className={`p-2 rounded-md border flex flex-col items-center gap-1 text-[10px] ${
                      selected
                        ? 'border-[#f17832] bg-orange-50 text-[#f17832] font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              updateSettings({ displayName, email, dealershipName })
            }
            style={{ backgroundColor: state.settings.accentColor }}
            className="px-4 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save changes</span>
          </button>
        </div>

        {/* Plan & Access Card */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Plan &amp; Access</h2>
            <span className="text-xs font-bold text-emerald-600 font-mono">
              DEALERSHIP ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {[
              {
                id: 'Starter Free',
                price: '$0/mo',
                desc: 'For hobbyists · Up to 5 cars in stock',
              },
              {
                id: 'Solo',
                price: '$12.50/mo',
                desc: 'For independent traders · 1 seat, FIFO parts',
              },
              {
                id: 'Dealership',
                price: '$40.83/mo',
                desc: 'For multi-user lots · 10 seats, Voice AI, RBAC',
              },
            ].map((p) => {
              const active = state.settings.plan === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => updateSettings({ plan: p.id as any })}
                  className={`p-3 rounded-lg border text-left ${
                    active
                      ? 'border-[#f17832] bg-orange-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-slate-900">{p.id}</div>
                  <div className="font-mono font-bold text-sm text-[#f17832] mt-0.5">
                    {p.price}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{p.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Promo code"
              className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-200 font-mono"
            />
            <button
              type="button"
              onClick={() => updateSettings({ promoCode })}
              className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Apply Promo
            </button>
          </div>
        </div>

        {/* Preferences & Report Branding */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">
            Workspace Preferences &amp; Report Branding
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Display Currency Select
              </label>
              <select
                value={state.settings.currency}
                onChange={(e) =>
                  updateSettings({ currency: e.target.value as CurrencyCode })
                }
                aria-label="Display Currency Select"
                className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Workspace Language Select
              </label>
              <select
                value={state.settings.language}
                onChange={(e) =>
                  updateSettings({ language: e.target.value as LanguageCode })
                }
                aria-label="Workspace Language Select"
                className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="accent-picker"
                className="font-medium text-slate-700"
              >
                Brand Accent Color Hex Picker
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="accent-picker"
                  type="color"
                  value={state.settings.accentColor}
                  onChange={(e) =>
                    updateSettings({ accentColor: e.target.value })
                  }
                  className="w-8 h-7 rounded cursor-pointer border border-slate-300"
                />
                <span className="font-mono text-xs text-slate-700">
                  {state.settings.accentColor}
                </span>
              </div>
            </div>

            {/* Live PDF Header Preview */}
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div
                style={{ backgroundColor: state.settings.accentColor }}
                className="px-4 py-2.5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
              >
                <span className="font-bold">
                  {state.settings.dealershipName} — Executive Financial Report
                </span>
                <span className="font-mono text-[11px]">
                  Sample Value: {fmtMoney(21900)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* MCP & AI Agent Connector Card */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">
                MCP &amp; AI Agent Connector
              </h2>
              <p className="text-xs text-slate-500 font-mono break-all">
                https://mcp.cardealertracker.app/mcp
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(
                  `Connect to Car Dealer Tracker MCP at https://mcp.cardealertracker.app/mcp for ${state.settings.dealershipName}. Available tools: get_inventory_summary, list_vehicles, get_profit_summary, list_debts, get_accounts_overview.`
                );
                showToast('Copied Agent Bootstrap Prompt to clipboard.');
              }}
              className="px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1 self-start sm:self-auto shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Bootstrap Prompt</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <select
              value={selectedMcpTool}
              onChange={(e) => setSelectedMcpTool(e.target.value)}
              aria-label="Select MCP JSON-RPC Tool"
              className="flex-1 px-3 py-2 rounded-md border border-slate-200 bg-white font-mono min-w-0"
            >
              <option value="get_inventory_summary">
                get_inventory_summary
              </option>
              <option value="list_vehicles">list_vehicles</option>
              <option value="get_profit_summary">get_profit_summary</option>
              <option value="list_debts">list_debts</option>
              <option value="get_accounts_overview">
                get_accounts_overview
              </option>
            </select>
            <button
              type="button"
              onClick={runMcpToolTester}
              style={{ backgroundColor: state.settings.accentColor }}
              className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Test JSON-RPC</span>
            </button>
          </div>

          {mcpOutput && (
            <pre className="p-3 rounded-md bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-44">
              {mcpOutput}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
