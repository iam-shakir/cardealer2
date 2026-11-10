import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  Car,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  UserCheck,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { useDealership } from '../context/DealershipContext';
import { ModuleRoute, RoleType } from '../types';
import { getLowStockPartAlerts } from '../utils/accounting';

export const VehiclePhoto: React.FC<{
  src?: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = 'w-14 h-10 rounded object-cover' }) => {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return (
      <div
        className={`bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 border border-slate-700 ${className}`}
        aria-label={alt}
      >
        <Car className="w-5 h-5 text-[#f17832]" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`object-cover shrink-0 bg-slate-100 border border-slate-200 ${className}`}
    />
  );
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    state,
    activeRoute,
    setActiveRoute,
    openModal,
    isAssistantOpen,
    setIsAssistantOpen,
    isSensitiveVisible,
    canMutate,
    setActiveRole,
    toggleOnlineStatus,
    toastMessage,
    fmtMoney,
    createReorderRequest,
    firebaseUser,
    cloudSyncSummary,
    signInWithGoogle,
    signOutGoogle,
    syncNowToFirebase,
  } = useDealership();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const overdueLeads = state.clients.filter((c) => c.isOverdue && c.stage !== 'Sold');
  const overdueDebts = state.debts.filter((d) => d.isOverdue && d.status !== 'Settled');
  const lowStockAlerts = getLowStockPartAlerts(state);
  const totalAlerts =
    overdueLeads.length +
    (isSensitiveVisible ? overdueDebts.length : 0) +
    lowStockAlerts.length;

  const navItems: Array<{
    id: ModuleRoute;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    sensitiveOnly?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Car,
      badge: state.vehicles.filter((v) => v.status !== 'Sold').length,
    },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'sales', label: 'Sales', icon: CreditCard, badge: state.sales.length },
    {
      id: 'clients',
      label: 'Clients (CRM)',
      icon: Users,
      badge: state.clients.filter((c) => c.stage !== 'Sold').length,
    },
    {
      id: 'parts',
      label: 'Parts (FIFO)',
      icon: Package,
      badge: lowStockAlerts.length > 0 ? lowStockAlerts.length : undefined,
    },
    {
      id: 'finance',
      label: 'Finance & Accounts',
      icon: Landmark,
      sensitiveOnly: true,
    },
    { id: 'reports', label: 'Analytics & Reports', icon: BarChart3 },
    {
      id: 'ideas',
      label: 'Ideas & Voting',
      icon: Lightbulb,
      badge: state.ideas.filter((i) => i.status === 'Open').length,
    },
    { id: 'team', label: 'Team & Permissions', icon: UserCheck },
    { id: 'settings', label: 'Settings & Profile', icon: Settings },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.sensitiveOnly || isSensitiveVisible
  );

  const roles: RoleType[] = ['Owner', 'Admin', 'Sales', 'Viewer'];

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900 overflow-x-hidden">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Navigation Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-[#18181b] text-zinc-100 flex flex-col border-r border-zinc-800 transition-transform duration-150 shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shrink-0"
              style={{ backgroundColor: state.settings.accentColor }}
            >
              <Car className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm tracking-tight text-white truncate">
                Car Dealer Tracker
              </div>
              <div className="text-xs text-zinc-400 truncate">
                {state.settings.dealershipName}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Role Quick Switcher Bar */}
        <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
            <span>Active Session Role</span>
            <span className="font-mono text-zinc-300">{state.settings.activeRole}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 rounded-md border border-zinc-800">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                aria-label={`Switch role to ${r}`}
                onClick={() => setActiveRole(r)}
                className={`py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  state.settings.activeRole === r
                    ? 'bg-[#f17832] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* 11 Navigation Modules */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5" aria-label="Main Modules">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveRoute(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#f17832]' : 'text-zinc-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && (
                  <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                    {item.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        {/* Bottom Trigger: What's New in v2.5.0 */}
        <div className="p-3 border-t border-zinc-800 space-y-2">
          <button
            type="button"
            onClick={() => {
              openModal('whats_new');
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-zinc-800/70 hover:bg-zinc-800 text-xs text-zinc-200 transition-colors"
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Sparkles className="w-3.5 h-3.5 text-[#f17832]" />
              <span>What&apos;s New in v2.5.0</span>
            </span>
            <span className="font-mono text-[10px] text-zinc-400">Release</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        {/* Global Utility Header */}
        <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-2.5 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Mobile Menu + Contextual Breadcrumb + Global Command Search */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100 shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => openModal('command_search')}
              className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200/70 text-slate-600 text-xs transition-colors border border-slate-200 flex-1 sm:flex-initial max-w-[205px] sm:max-w-none sm:w-64 md:w-80 justify-between min-w-0"
              aria-label="Global Command Search"
            >
              <span className="flex items-center gap-1.5 sm:gap-2 truncate min-w-0">
                <Search className="w-3.5 h-3.5 text-[#f17832] shrink-0" />
                <span className="truncate">
                  Jump to clients, inventory, treasury...
                </span>
              </span>
              <kbd className="hidden sm:inline-block font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                ⌘K
              </kbd>
            </button>

            {!isSensitiveVisible && (
              <div className="hidden xl:flex items-center gap-1.5 text-xs text-amber-700 font-medium whitespace-nowrap">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Role: {state.settings.activeRole} (Costs &amp; Profit Masked)</span>
              </div>
            )}
          </div>

          {/* Right: Firebase Cloud Sync + Offline Toggle + Notifications + Assistant + Quick Add */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Firebase Auth & Firestore Cloud Sync Button */}
            {firebaseUser ? (
              <div className="hidden sm:flex items-center gap-1 bg-emerald-50/90 border border-emerald-200 rounded-md px-2 py-1 text-[11px] text-emerald-900">
                <button
                  type="button"
                  onClick={() => void syncNowToFirebase()}
                  className="font-semibold hover:underline flex items-center gap-1 whitespace-nowrap"
                  title={`Connected to Firestore (${firebaseUser.email || firebaseUser.uid}). Click to push full sync.`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden lg:inline">Firestore Synced</span>
                  <span className="lg:hidden">Cloud</span>
                  {cloudSyncSummary.syncedVehiclesCount !== undefined && (
                    <span className="font-mono text-[10px] text-emerald-700">
                      ({cloudSyncSummary.syncedVehiclesCount})
                    </span>
                  )}
                </button>
                <span className="text-emerald-300">|</span>
                <button
                  type="button"
                  onClick={() => void signOutGoogle()}
                  className="text-[10px] font-mono text-emerald-700 hover:text-rose-700 whitespace-nowrap"
                  title="Sign out of Firebase Auth"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap"
                title="Sign in with Google to sync workspace to Firebase Firestore"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#f17832] shrink-0" />
                <span className="hidden md:inline">Firebase Sign In</span>
              </button>
            )}

            {/* Offline / Online Sync Toggle */}
            <button
              type="button"
              onClick={toggleOnlineStatus}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                state.settings.isOnline
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
              title="Toggle Online / Offline Local-First Sync Queue"
            >
              {state.settings.isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden md:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-[11px] sm:text-xs">
                    Offline{' '}
                    {state.settings.queuedSyncCount > 0
                      ? `(${state.settings.queuedSyncCount})`
                      : ''}
                  </span>
                </>
              )}
            </button>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((p) => !p)}
                className="relative p-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                aria-label={`Notifications (${totalAlerts} overdue)`}
              >
                <Bell className="w-4 h-4" />
                {totalAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded bg-rose-600 text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                    {totalAlerts}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed sm:absolute inset-x-3 top-15 sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96 bg-white rounded-lg border border-slate-200 shadow-xl p-3.5 z-50">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-[#f17832]" />
                      <span>Attention Needed ({totalAlerts})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Close
                    </button>
                  </div>
                  <div className="space-y-2.5 max-h-[70vh] sm:max-h-80 overflow-y-auto text-xs pr-1">
                    {/* Low Stock Parts with 1-Click Reorder */}
                    {lowStockAlerts.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
                          <span>Low Stock Inventory Alerts ({lowStockAlerts.length})</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveRoute('parts');
                              setNotifOpen(false);
                            }}
                            className="text-blue-600 hover:underline text-[10px] font-semibold"
                          >
                            View All Parts →
                          </button>
                        </div>
                        {lowStockAlerts.map((alert) => (
                          <div
                            key={alert.partId}
                            className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/60 flex flex-col gap-1.5"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0 ${
                                      alert.urgency === 'Critical'
                                        ? 'bg-rose-600'
                                        : 'bg-amber-600'
                                    }`}
                                  >
                                    {alert.urgency === 'Critical'
                                      ? 'OUT OF STOCK'
                                      : 'LOW STOCK'}
                                  </span>
                                  <span className="truncate">{alert.name}</span>
                                </div>
                                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                                  SKU: {alert.code} · In Stock:{' '}
                                  <strong
                                    className={
                                      alert.currentStock <= 1
                                        ? 'text-rose-600'
                                        : 'text-amber-700'
                                    }
                                  >
                                    {alert.currentStock} units
                                  </strong>{' '}
                                  (Reorder threshold: {alert.safetyStockThreshold})
                                </div>
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-600">
                              Historical usage: ~{alert.monthlyBurnRate} units/mo · {alert.statusMessage}
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/70">
                              <span className="text-[11px] font-mono font-medium text-slate-700">
                                Reorder: {alert.suggestedReorderQty} units (~{fmtMoney(alert.totalEstimatedCost)})
                              </span>
                              {alert.isPendingReorder ? (
                                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded shrink-0">
                                  PO Active
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!canMutate}
                                  onClick={() => {
                                    createReorderRequest(alert.partId, alert.suggestedReorderQty);
                                  }}
                                  className="px-2 py-1 rounded bg-[#f17832] hover:bg-[#dc621e] text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs disabled:opacity-50 transition-colors shrink-0"
                                >
                                  <Zap className="w-3 h-3" />
                                  <span>1-Click Reorder</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* CRM Overdue Leads */}
                    {overdueLeads.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                          CRM Follow-Ups ({overdueLeads.length})
                        </div>
                        {overdueLeads.map((lead) => (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => {
                              setActiveRoute('clients');
                              setNotifOpen(false);
                            }}
                            className="w-full text-left p-2 rounded hover:bg-slate-50 border border-slate-100"
                          >
                            <div className="font-medium text-slate-900">
                              Overdue CRM Follow-up: {lead.name}
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              Due {lead.preferredContactDate} · Stage: {lead.stage}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Financial Debts */}
                    {isSensitiveVisible && overdueDebts.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                          Overdue Balances ({overdueDebts.length})
                        </div>
                        {overdueDebts.map((debt) => (
                          <button
                            key={debt.id}
                            type="button"
                            onClick={() => {
                              setActiveRoute('finance');
                              setNotifOpen(false);
                            }}
                            className="w-full text-left p-2 rounded hover:bg-slate-50 border border-slate-100"
                          >
                            <div className="font-medium text-rose-700">
                              Overdue Balance: {debt.counterparty}
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              {debt.direction} · Due {debt.dueDate}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {totalAlerts === 0 && (
                      <div className="text-slate-500 py-3 text-center">
                        All parts inventory, CRM follow-ups, and balances are up to date.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ✨ Assistant Slide-Out Toggle Button */}
            <button
              type="button"
              aria-label="✨ Assistant"
              onClick={() => setIsAssistantOpen(!isAssistantOpen)}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
                isAssistantOpen
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#f17832] shrink-0" />
              <span className="hidden sm:inline">✨ Assistant</span>
              <span className="sm:hidden text-[11px]">AI</span>
            </button>

            {/* + Add Quick Action Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                disabled={!canMutate}
                onClick={() => setQuickAddOpen((p) => !p)}
                style={{ backgroundColor: state.settings.accentColor }}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-md text-xs font-semibold text-white hover:opacity-95 transition-opacity disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>+ Add</span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>

              {quickAddOpen && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      openModal('add_vehicle');
                      setQuickAddOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Car className="w-3.5 h-3.5 text-[#f17832]" />
                    <span>Add vehicle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openModal('add_expense');
                      setQuickAddOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Receipt className="w-3.5 h-3.5 text-[#f17832]" />
                    <span>Add expense</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openModal('record_sale');
                      setQuickAddOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#f17832]" />
                    <span>Record sale</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openModal('add_client');
                      setQuickAddOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Users className="w-3.5 h-3.5 text-[#f17832]" />
                    <span>Add client</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6 max-w-[1440px] w-full mx-auto min-w-0">
          {children}
        </main>

        {/* Mobile Bottom Thumb-Zone Navigation Bar (< lg) */}
        <nav
          aria-label="Mobile Bottom Navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center px-1 no-print"
        >
          {(
            [
              { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
              { id: 'inventory', label: 'Inventory', icon: Car },
              { id: 'clients', label: 'CRM', icon: Users },
              { id: 'parts', label: 'Parts', icon: Package },
              { id: 'reports', label: 'Reports', icon: BarChart3 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeRoute === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveRoute(tab.id)}
                className={`flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-semibold transition-colors ${
                  active ? 'text-[#f17832]' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-full px-1">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-16 lg:bottom-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-4 py-2.5 rounded-lg shadow-lg border border-zinc-700 flex items-center gap-2 text-xs font-medium max-w-[92vw]"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
