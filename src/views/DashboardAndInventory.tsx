import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CheckSquare,
  Database,
  FileText,
  LayoutGrid,
  List,
  MessageCircle,
  MessageSquare,
  Package,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { useDealership } from '../context/DealershipContext';
import { VehiclePhoto } from '../components/AppShell';
import {
  calculateDashboardMetrics,
  calculateProjectedMonthlyGrowth,
  calculateVehicleMarginPct,
  calculateVehicleNetProfit,
  calculateVehicleTotalCost,
  DashboardMonthlyPoint,
  getLowStockPartAlerts,
  getVehicleExpensesSum,
  getVehicleLinkedExpenses,
  GrowthForecastScenario,
} from '../utils/accounting';
import { VehicleStatus } from '../types';

export const DashboardView: React.FC = () => {
  const {
    state,
    isHydrated,
    lastSyncedAt,
    setActiveRoute,
    setSelectedVehicleId,
    setIsAssistantOpen,
    updateSettings,
    fmtMoney,
    isSensitiveVisible,
    openModal,
    createReorderRequest,
    canMutate,
  } = useDealership();

  const [timeFilter, setTimeFilter] = useState<'month' | 'all'>('all');
  const [chartTab, setChartTab] = useState<
    'All Trends' | 'Revenue & Profit' | 'Profit Margins' | 'Inventory Turnover'
  >('All Trends');
  const [forecastScenario, setForecastScenario] =
    useState<GrowthForecastScenario>('baseline');
  const [includeNextMonthPoint, setIncludeNextMonthPoint] = useState<boolean>(true);

  // Aggregate all Dashboard metrics directly from global DealershipState
  const metrics = useMemo(
    () => calculateDashboardMetrics(state, timeFilter),
    [state, timeFilter]
  );

  // Compute AI-driven Projected Monthly Growth line & next month's estimate from 6-month trends
  const growthModel = useMemo(
    () =>
      calculateProjectedMonthlyGrowth(
        metrics.monthlySeries,
        state,
        forecastScenario
      ),
    [metrics.monthlySeries, state, forecastScenario]
  );

  const lowStockAlerts = useMemo(() => getLowStockPartAlerts(state), [state]);

  const activeVehicles = useMemo(
    () => state.vehicles.filter((v) => v.status !== 'Sold'),
    [state.vehicles]
  );
  const agedVehicles = useMemo(
    () => activeVehicles.filter((v) => v.daysInStock >= 45),
    [activeVehicles]
  );
  const activeClientDeals = useMemo(
    () => state.clients.filter((c) => c.stage !== 'Sold'),
    [state.clients]
  );
  const overdueFollowUps = useMemo(
    () => state.clients.filter((c) => c.isOverdue && c.stage !== 'Sold'),
    [state.clients]
  );

  const historicalMonthlyData = growthModel.enrichedHistoricalSeries;
  const chartData = includeNextMonthPoint
    ? growthModel.seriesWithNextMonthForecast
    : growthModel.enrichedHistoricalSeries;
  const growthForecast = growthModel.summary;
  const lastActualMonthRev =
    historicalMonthlyData[historicalMonthlyData.length - 1]?.revenue || 0;

  return (
    <div className="space-y-6">
      {/* Dismissible Voice to Work Banner */}
      {!state.settings.dismissedVoiceBanner && (
        <div className="bg-[#18181b] text-white rounded-lg p-4 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="w-4 h-4 text-[#f17832]" />
              <span>Voice to Work — Say it at the car, it&apos;s in your books</span>
            </div>
            <p className="text-xs text-zinc-400">
              Speak or type vehicle purchases, recon expenses, and receipt photos directly into your ledger with Before → After confirmation safety.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsAssistantOpen(true)}
              style={{ backgroundColor: state.settings.accentColor }}
              className="px-3.5 py-2 rounded-md text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap"
            >
              Try Voice to Work
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ dismissedVoiceBanner: true })}
              className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
              aria-label="Dismiss Voice to Work banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header & Time Filter Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Dealership Overview
            </h1>
            <span
              title={
                lastSyncedAt
                  ? `Synced to Firebase Firestore at ${new Date(lastSyncedAt).toLocaleTimeString()}`
                  : 'Connecting to Firestore...'
              }
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[11px] font-mono text-amber-800"
            >
              <Database className="w-3 h-3 text-amber-600" />
              <span>{isHydrated ? 'Firestore Synced' : 'Connecting Firestore...'}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Unified profit accounting across vehicles, recon expenses, FIFO parts, and treasury accounts
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTimeFilter('month')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              timeFilter === 'month'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              timeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All time
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Cards Aggregated from Global State */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Inventory Value</span>
              <span className="font-mono text-[11px] text-slate-400">
                {metrics.activeVehiclesCount} in stock
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {fmtMoney(metrics.inventoryPurchaseValue, true)}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
            <span>All-in: {fmtMoney(metrics.inventoryTotalInvestmentValue, true)}</span>
            <span>Asking: {fmtMoney(metrics.inventoryRetailAskingValue)}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Sales Revenue</span>
              <span className="font-mono text-[11px] text-slate-400">
                {metrics.completedVehicleSalesCount} cars
                {metrics.completedPartSalesCount > 0
                  ? ` + ${metrics.completedPartSalesCount} parts`
                  : ''}
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {fmtMoney(metrics.totalSalesRevenue)}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
            <span>Vehicles: {fmtMoney(metrics.vehicleSalesRevenue)}</span>
            <span>Parts: {fmtMoney(metrics.partSalesRevenue)}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Calculated Profit</span>
              <span className="font-mono text-[11px] text-emerald-600 font-semibold">
                {isSensitiveVisible ? `${metrics.realizedMarginPct}% margin` : 'Masked'}
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600">
              {fmtMoney(metrics.totalRealizedProfit, true)}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
            <span>
              {isSensitiveVisible
                ? `Proj. Stock: +${fmtMoney(metrics.projectedInventoryProfit, true)}`
                : 'Restricted to Owner / Admin'}
            </span>
            {isSensitiveVisible && (
              <span>Net Op: {fmtMoney(metrics.netOperatingProfitAfterOverhead, true)}</span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Expenses</span>
              <span className="font-mono text-[11px] text-slate-400">
                {metrics.totalExpensesCount} entries
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {fmtMoney(metrics.totalExpensesSum)}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
            <span>Recon: {fmtMoney(metrics.vehicleLinkedExpensesSum)}</span>
            <span>Overhead: {fmtMoney(metrics.generalOverheadExpensesSum)}</span>
          </div>
        </div>
      </div>

      {/* Main Split: Performance Chart + Right Now (Needs Attention) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Chart using Recharts (2 cols) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Manager Trend Analysis &amp; AI Growth Forecast</span>
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-violet-600" />
                    <span>AI Projected Growth</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  6-month historical revenue, profit margins, and AI-driven next-month trajectory ({growthForecast.nextMonthKey})
                </p>
              </div>

              {/* View Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md self-start overflow-x-auto max-w-full w-full sm:w-auto no-scrollbar">
                {(
                  [
                    'All Trends',
                    'Revenue & Profit',
                    'Profit Margins',
                    'Inventory Turnover',
                  ] as const
                ).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setChartTab(t)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                      chartTab === t
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Projected Monthly Growth Callout Strip */}
            <div className="my-3.5 p-3 rounded-lg bg-gradient-to-r from-violet-50/90 via-indigo-50/50 to-slate-50 border border-violet-200/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse shrink-0" />
                  <span className="text-xs font-bold text-slate-900">
                    AI Projected Monthly Growth ({growthForecast.nextMonthLabel} · {growthForecast.nextMonthKey})
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      growthForecast.momRevenueGrowthPct >= 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {growthForecast.momRevenueGrowthPct >= 0 ? '+' : ''}
                    {growthForecast.momRevenueGrowthPct}% MoM
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex items-center bg-white/90 border border-violet-200 rounded p-0.5 text-[10px]">
                    {(
                      [
                        { id: 'baseline', label: 'AI Baseline' },
                        { id: 'bullish', label: 'Bullish (+CRM)' },
                        { id: 'conservative', label: 'Conservative' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setForecastScenario(s.id)}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors whitespace-nowrap ${
                          forecastScenario === s.id
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIncludeNextMonthPoint((prev) => !prev)}
                    className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold transition-colors whitespace-nowrap ${
                      includeNextMonthPoint
                        ? 'bg-violet-100/80 border-violet-300 text-violet-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {includeNextMonthPoint ? 'Showing Dec (Proj.)' : '+ Show Dec (Proj.)'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                <div className="bg-white/80 rounded p-2 border border-violet-100">
                  <div className="text-[10px] text-slate-500 font-medium">
                    Est. Next Month Revenue
                  </div>
                  <div className="font-bold font-mono text-violet-700 text-sm tabular-nums">
                    {fmtMoney(growthForecast.projectedRevenue)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    vs {fmtMoney(lastActualMonthRev)} in Nov
                  </div>
                </div>

                <div className="bg-white/80 rounded p-2 border border-violet-100">
                  <div className="text-[10px] text-slate-500 font-medium">
                    Est. Next Month Profit
                  </div>
                  <div className="font-bold font-mono text-emerald-600 text-sm tabular-nums">
                    {isSensitiveVisible
                      ? fmtMoney(growthForecast.projectedProfit, true)
                      : 'Masked'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {isSensitiveVisible
                      ? `${growthForecast.projectedMarginPct}% est. margin`
                      : 'Owner / Admin only'}
                  </div>
                </div>

                <div className="bg-white/80 rounded p-2 border border-violet-100">
                  <div className="text-[10px] text-slate-500 font-medium">
                    6-Mo Trend Velocity
                  </div>
                  <div className="font-bold font-mono text-slate-900 text-sm tabular-nums">
                    {growthForecast.sixMonthTrendSlope >= 0 ? '+' : ''}
                    {fmtMoney(growthForecast.sixMonthTrendSlope)}/mo
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    CRM boost: +{fmtMoney(growthForecast.pipelineContribution)}
                  </div>
                </div>

                <div className="bg-white/80 rounded p-2 border border-violet-100">
                  <div className="text-[10px] text-slate-500 font-medium">
                    89% Forecast Range
                  </div>
                  <div className="font-bold font-mono text-slate-800 text-xs tabular-nums pt-0.5">
                    {fmtMoney(growthForecast.confidenceIntervalLow)} –{' '}
                    {fmtMoney(growthForecast.confidenceIntervalHigh)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    OLS + 3-Mo Momentum
                  </div>
                </div>
              </div>
            </div>

            {/* Manager KPI Snapshot Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3.5 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
              <div>
                <div className="text-[11px] text-slate-500 font-medium">6-Mo Avg Margin</div>
                <div className="font-bold font-mono text-emerald-600 text-sm">
                  {isSensitiveVisible
                    ? `${(
                        historicalMonthlyData.reduce((s, d) => s + d.profitMarginPct, 0) /
                        Math.max(1, historicalMonthlyData.length)
                      ).toFixed(1)}%`
                    : 'Masked'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 font-medium">Peak Revenue Month</div>
                <div className="font-bold font-mono text-slate-900 text-sm">
                  {(() => {
                    const peak = [...historicalMonthlyData].sort(
                      (a, b) => b.revenue - a.revenue
                    )[0];
                    return peak ? `${peak.month} (${fmtMoney(peak.revenue)})` : '—';
                  })()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 font-medium">Avg Annualized Turns</div>
                <div className="font-bold font-mono text-amber-600 text-sm">
                  {(
                    historicalMonthlyData.reduce(
                      (s, d) => s + d.inventoryTurnoverRate,
                      0
                    ) / Math.max(1, historicalMonthlyData.length)
                  ).toFixed(2)}
                  x / yr
                </div>
              </div>
            </div>

            {/* Recharts Composed Canvas */}
            <div className="w-full h-[280px] pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) =>
                      `$${val >= 1000 ? Math.round(val / 1000) + 'k' : val}`
                    }
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) =>
                      chartTab === 'Inventory Turnover' ? `${val}x` : `${val}%`
                    }
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const point = payload[0].payload as DashboardMonthlyPoint;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-zinc-700 text-xs font-sans space-y-1.5 z-50">
                            <div className="font-bold border-b border-zinc-700 pb-1 text-zinc-200 flex items-center justify-between gap-3">
                              <span>
                                {point.monthKey} ({point.month})
                              </span>
                              {point.isProjected && (
                                <span className="px-1.5 py-0.5 rounded bg-violet-600/30 border border-violet-400/50 text-violet-200 text-[10px] font-mono">
                                  AI Forecast
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-6 text-zinc-300">
                              <span>
                                {point.isProjected
                                  ? 'Forecasted Revenue:'
                                  : 'Gross Revenue:'}
                              </span>
                              <strong className="text-white font-mono">
                                {fmtMoney(
                                  point.isProjected
                                    ? point.projectedGrowthRevenue || point.revenue
                                    : point.revenue
                                )}
                              </strong>
                            </div>
                            {point.projectedGrowthRevenue !== undefined && (
                              <div className="flex items-center justify-between gap-6 text-violet-300">
                                <span>Projected Monthly Growth:</span>
                                <strong className="font-mono text-violet-200">
                                  {fmtMoney(point.projectedGrowthRevenue)}
                                  {point.projectedGrowthRatePct !== undefined
                                    ? ` (${point.projectedGrowthRatePct >= 0 ? '+' : ''}${point.projectedGrowthRatePct}%)`
                                    : ''}
                                </strong>
                              </div>
                            )}
                            {isSensitiveVisible && (
                              <div className="flex items-center justify-between gap-6 text-emerald-400">
                                <span>
                                  {point.isProjected
                                    ? 'Projected Net Profit:'
                                    : 'Realized Net Profit:'}
                                </span>
                                <strong className="font-mono">
                                  {fmtMoney(
                                    point.isProjected
                                      ? point.projectedGrowthProfit || point.profit
                                      : point.profit,
                                    true
                                  )}
                                </strong>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-6 text-[#f17832]">
                              <span>Operating Expenses:</span>
                              <strong className="font-mono">
                                {fmtMoney(point.expenses)}
                              </strong>
                            </div>
                            <div className="pt-1 border-t border-zinc-800 flex items-center justify-between gap-6 text-sky-400">
                              <span>Profit Margin:</span>
                              <strong className="font-mono">{point.profitMarginPct}%</strong>
                            </div>
                            <div className="flex items-center justify-between gap-6 text-amber-400">
                              <span>Inventory Turnover:</span>
                              <strong className="font-mono">
                                {point.inventoryTurnoverRate}x / yr
                              </strong>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* Dynamic series based on selected manager tab */}
                  {(chartTab === 'All Trends' || chartTab === 'Revenue & Profit') && (
                    <Bar
                      yAxisId="left"
                      dataKey="revenue"
                      name="Gross Revenue"
                      fill="#1e293b"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  )}

                  {(chartTab === 'All Trends' || chartTab === 'Revenue & Profit') &&
                    isSensitiveVisible && (
                      <Bar
                        yAxisId="left"
                        dataKey="profit"
                        name="Realized Net Profit"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                      />
                    )}

                  {chartTab === 'Revenue & Profit' && (
                    <Bar
                      yAxisId="left"
                      dataKey="expenses"
                      name="Operating Expenses"
                      fill="#f17832"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  )}

                  {/* AI-Driven Projected Monthly Growth Line */}
                  {(chartTab === 'All Trends' || chartTab === 'Revenue & Profit') && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="projectedGrowthRevenue"
                      name="Projected Monthly Growth"
                      stroke="#7c3aed"
                      strokeWidth={2.75}
                      strokeDasharray="6 3"
                      dot={{ r: 4.5, fill: '#7c3aed', stroke: '#ffffff', strokeWidth: 1.5 }}
                      activeDot={{ r: 6.5, fill: '#6d28d9', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {(chartTab === 'All Trends' || chartTab === 'Profit Margins') &&
                    isSensitiveVisible && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="profitMarginPct"
                        name="Profit Margin %"
                        stroke="#0284c7"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#0284c7' }}
                        activeDot={{ r: 6 }}
                      />
                    )}

                  {(chartTab === 'All Trends' || chartTab === 'Inventory Turnover') && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="inventoryTurnoverRate"
                      name="Turnover Rate (Turns/Yr)"
                      stroke="#d97706"
                      strokeWidth={2.5}
                      strokeDasharray={chartTab === 'All Trends' ? '4 4' : undefined}
                      dot={{ r: 4, fill: '#d97706' }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Interactive Legend Footbar */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
            {(chartTab === 'All Trends' || chartTab === 'Revenue & Profit') && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#1e293b] inline-block" />
                <span>Revenue ($)</span>
              </span>
            )}
            {(chartTab === 'All Trends' || chartTab === 'Revenue & Profit') && (
              <span className="flex items-center gap-1.5 font-semibold text-violet-700">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-[#7c3aed] inline-block" />
                <span>Projected Monthly Growth (AI)</span>
              </span>
            )}
            {(chartTab === 'All Trends' || chartTab === 'Revenue & Profit') &&
              isSensitiveVisible && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#10b981] inline-block" />
                  <span>Profit ($)</span>
                </span>
              )}
            {chartTab === 'Revenue & Profit' && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#f17832] inline-block" />
                <span>Expenses ($)</span>
              </span>
            )}
            {(chartTab === 'All Trends' || chartTab === 'Profit Margins') &&
              isSensitiveVisible && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] inline-block" />
                  <span>Margin % (Right Axis)</span>
                </span>
              )}
            {(chartTab === 'All Trends' || chartTab === 'Inventory Turnover') && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#d97706] inline-block" />
                <span>Inventory Turns (x/yr)</span>
              </span>
            )}
          </div>
        </div>

        {/* Right Now (Needs Attention) Card */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">
                Right Now (Needs Attention)
              </h2>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>

            <div className="divide-y divide-slate-100 my-2">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Aged 45+ days in stock
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Units accruing holding cost beyond target turn
                  </div>
                </div>
                <span className="text-base font-bold font-mono tabular-nums text-rose-600">
                  {agedVehicles.length}
                </span>
              </div>

              {/* Low Stock Parts Notification */}
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>Low stock parts alerts</span>
                    {lowStockAlerts.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        Usage Alert
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Parts below safety stock by historical usage velocity
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRoute('parts')}
                  className="text-base font-bold font-mono tabular-nums text-amber-600 hover:underline"
                  title="Click to view low stock parts and reorder"
                >
                  {lowStockAlerts.length}
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Active client deals
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Buyers in New Lead, Viewing, or Negotiation
                  </div>
                </div>
                <span className="text-base font-bold font-mono tabular-nums text-blue-600">
                  {activeClientDeals.length}
                </span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Overdue follow-ups
                  </div>
                  <div className="text-[11px] text-slate-500">
                    CRM leads past preferred contact date
                  </div>
                </div>
                <span className="text-base font-bold font-mono tabular-nums text-amber-600">
                  {overdueFollowUps.length}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveRoute('inventory')}
            className="mt-4 w-full py-2 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Review inventory</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Split: In Stock Preview List & Latest Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* In Stock Preview List */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              In Stock Units ({activeVehicles.length})
            </h2>
            <button
              type="button"
              onClick={() => setActiveRoute('inventory')}
              className="text-xs font-semibold text-[#f17832] hover:underline"
            >
              View all inventory →
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {activeVehicles.slice(0, 4).map((v) => {
              const netProfit = calculateVehicleNetProfit(v, state.expenses, state.sales);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setSelectedVehicleId(v.id);
                    setActiveRoute('inventory');
                  }}
                  className="w-full px-3.5 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <VehiclePhoto
                      src={v.coverPhoto}
                      alt={`${v.year} ${v.make} ${v.model}`}
                      className="w-12 h-9 rounded"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {v.year} {v.make} {v.model} {v.trim}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                        {v.stockId} · {v.status} · {v.daysInStock}d in stock
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <div className="text-xs font-bold text-slate-900">
                      {fmtMoney(v.askingPrice)}
                    </div>
                    <div className="text-[11px] text-emerald-600">
                      {isSensitiveVisible
                        ? `Proj. +${fmtMoney(netProfit, true)}`
                        : `${v.mileage.toLocaleString()} mi`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Latest Activity Stream */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3.5 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Latest Ledger Activity</h2>
            <button
              type="button"
              onClick={() => openModal('add_expense')}
              className="text-xs font-semibold text-[#f17832] hover:underline"
            >
              + Log expense
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {state.transactions.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="px-3.5 sm:px-5 py-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {tx.description}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {tx.date} · {tx.source}
                  </div>
                </div>
                <div
                  className={`font-mono font-bold tabular-nums shrink-0 ${
                    tx.direction === 'Inflow' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {tx.direction === 'Inflow' ? '+' : '-'}
                  {fmtMoney(tx.amount, tx.source === 'Vehicle Purchase')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const InventoryView: React.FC = () => {
  const {
    state,
    selectedVehicleId,
    setSelectedVehicleId,
    openModal,
    fmtMoney,
    isSensitiveVisible,
    canMutate,
    updateVehicle,
    showToast,
  } = useDealership();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | VehicleStatus>('All');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const statuses: Array<'All' | VehicleStatus> = [
    'All',
    'Owned',
    'In transit',
    'In prep',
    'Available',
    'Reserved',
    'Sold',
  ];

  const filteredVehicles = state.vehicles.filter((v) => {
    const matchesStatus = statusFilter === 'All' || v.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      `${v.year} ${v.make} ${v.model} ${v.trim}`.toLowerCase().includes(q) ||
      v.vin.toLowerCase().includes(q) ||
      v.stockId.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const selectedVehicle = state.vehicles.find((v) => v.id === selectedVehicleId) || null;

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredVehicles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredVehicles.map((v) => v.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const getStatusTextColor = (status: VehicleStatus) => {
    switch (status) {
      case 'Available':
      case 'Sold':
        return 'text-emerald-700 font-semibold';
      case 'In prep':
      case 'Reserved':
        return 'text-amber-700 font-semibold';
      case 'In transit':
        return 'text-blue-700 font-semibold';
      default:
        return 'text-slate-700 font-semibold';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Vehicle Inventory ({filteredVehicles.length})
          </h1>
          <p className="text-xs text-slate-500">
            Click any unit to inspect itemized recon costs, unified net profit, and generate FTC Window Stickers
          </p>
        </div>
        <button
          type="button"
          disabled={!canMutate}
          onClick={() => openModal('add_vehicle')}
          style={{ backgroundColor: state.settings.accentColor }}
          className="px-4 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 self-start hover:opacity-95 disabled:opacity-50 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add vehicle</span>
        </button>
      </div>

      {/* Toolbar: Search, Status Filter Tabs, View Switcher, Select All */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 min-w-0">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search make, model, VIN, stock..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-none focus:border-[#f17832]"
            />
          </div>

          {/* Segmented Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md overflow-x-auto max-w-full no-scrollbar">
            {statuses.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 lg:self-auto">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
          >
            <CheckSquare className="w-3.5 h-3.5 text-slate-500" />
            <span>
              {selectedIds.length > 0
                ? `Selected (${selectedIds.length})`
                : 'Select All'}
            </span>
          </button>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded text-xs ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              aria-label="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded text-xs ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              aria-label="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Table (List View) or Cards (Grid View) */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left border-collapse">
            <thead>
              <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
                <th className="py-3 px-4 w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredVehicles.length > 0 &&
                      selectedIds.length === filteredVehicles.length
                    }
                    onChange={toggleSelectAll}
                    aria-label="Select all vehicles"
                  />
                </th>
                <th className="py-3 px-4">VEHICLE</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4 text-right">PURCHASE</th>
                <th className="py-3 px-4 text-right">ASKING</th>
                <th className="py-3 px-4 text-right">AGE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredVehicles.map((v) => {
                const isAged = v.daysInStock >= 45 && v.status !== 'Sold';
                const totalCost = calculateVehicleTotalCost(v, state.expenses);
                return (
                  <tr
                    key={v.id}
                    onClick={() => setSelectedVehicleId(v.id)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                      selectedVehicleId === v.id ? 'bg-orange-50/50' : ''
                    }`}
                  >
                    <td
                      className="py-3 px-4"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(v.id)}
                        onChange={() => toggleSelectOne(v.id)}
                        aria-label={`Select ${v.year} ${v.make} ${v.model}`}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <VehiclePhoto
                          src={v.coverPhoto}
                          alt={`${v.year} ${v.make} ${v.model}`}
                          className="w-14 h-10 rounded"
                        />
                        <div>
                          <div className="font-bold text-slate-900">
                            {v.year} {v.make} {v.model} {v.trim}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {v.stockId} · VIN: {v.vin} · {v.mileage.toLocaleString()} mi
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={getStatusTextColor(v.status)}>{v.status}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <div className="font-semibold text-slate-900">
                        {fmtMoney(v.purchasePrice, true)}
                      </div>
                      {isSensitiveVisible && (
                        <div className="text-[11px] text-slate-500">
                          All-in: {fmtMoney(totalCost, true)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      {fmtMoney(v.askingPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={
                          isAged
                            ? 'text-rose-600 font-bold'
                            : 'text-slate-700 font-medium'
                        }
                      >
                        {v.daysInStock} days in stock
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredVehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No vehicles match the active filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map((v) => {
            const isAged = v.daysInStock >= 45 && v.status !== 'Sold';
            return (
              <div
                key={v.id}
                onClick={() => setSelectedVehicleId(v.id)}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden cursor-pointer hover:border-[#f17832] transition-colors"
              >
                <VehiclePhoto
                  src={v.coverPhoto}
                  alt={`${v.year} ${v.make} ${v.model}`}
                  className="w-full h-44"
                />
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500">{v.stockId}</span>
                    <span className={getStatusTextColor(v.status)}>{v.status}</span>
                  </div>
                  <div className="font-bold text-sm text-slate-900">
                    {v.year} {v.make} {v.model} {v.trim}
                  </div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    VIN: {v.vin} · {v.mileage.toLocaleString()} mi
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-mono tabular-nums">
                    <div>
                      <div className="text-[10px] text-slate-400">ASKING</div>
                      <div className="text-sm font-bold text-slate-900">
                        {fmtMoney(v.askingPrice)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">AGE</div>
                      <div
                        className={`text-xs font-semibold ${
                          isAged ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        {v.daysInStock}d in stock
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Right-Hand Vehicle Detail Inspector Drawer */}
      {selectedVehicle && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col">
            {/* Top Drawer Bar */}
            <div className="px-4 sm:px-5 py-3.5 bg-[#18181b] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sticky top-0 z-10">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">
                  {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}{' '}
                  {selectedVehicle.trim}
                </div>
                <div className="text-xs text-zinc-400 font-mono tabular-nums truncate">
                  Stock: {selectedVehicle.stockId} · VIN: {selectedVehicle.vin}
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                <select
                  value={selectedVehicle.status}
                  disabled={!canMutate}
                  onChange={(e) =>
                    updateVehicle(selectedVehicle.id, {
                      status: e.target.value as VehicleStatus,
                    })
                  }
                  aria-label="Update vehicle status"
                  className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-xs font-semibold text-white"
                >
                  {(
                    [
                      'Owned',
                      'In transit',
                      'In prep',
                      'Available',
                      'Reserved',
                      'Sold',
                    ] as VehicleStatus[]
                  ).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedVehicleId(null)}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  aria-label="Close Vehicle Inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-5 flex-1">
              {/* Cover Photo */}
              <VehiclePhoto
                src={selectedVehicle.coverPhoto}
                alt={`${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`}
                className="w-full h-56 rounded-lg"
              />

              {/* 3 Action Buttons: Window Sticker, WhatsApp, Send SMS */}
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    openModal('window_sticker', { vehicleId: selectedVehicle.id })
                  }
                  className="py-2 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-[#f17832]" />
                  <span>Window Sticker</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openModal('whatsapp_share', { vehicleId: selectedVehicle.id })
                  }
                  className="py-2 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                </button>
                <a
                  href={`sms:?body=${encodeURIComponent(
                    `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model} ${selectedVehicle.trim} (VIN: ${selectedVehicle.vin}) — Asking ${fmtMoney(
                      selectedVehicle.askingPrice
                    )} at ${state.settings.dealershipName}`
                  )}`}
                  onClick={() =>
                    showToast('Prepared SMS spec message with vehicle VIN & price.')
                  }
                  className="py-2 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>Send SMS</span>
                </a>
              </div>

              {/* 7-Card Spec Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  Vehicle Specifications
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                    <div className="text-[10px] text-slate-500">Purchased Date</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {selectedVehicle.purchaseDate}
                    </div>
                  </div>
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                    <div className="text-[10px] text-slate-500">Mileage</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                      {selectedVehicle.mileage.toLocaleString()} mi
                    </div>
                  </div>
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                    <div className="text-[10px] text-slate-500">Days in Stock</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                      {selectedVehicle.daysInStock} days
                    </div>
                  </div>
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                    <div className="text-[10px] text-slate-500">Stock ID</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {selectedVehicle.stockId}
                    </div>
                  </div>
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                    <div className="text-[10px] text-slate-500">Engine</div>
                    <div className="font-semibold text-slate-900 mt-0.5 truncate">
                      {selectedVehicle.engine}
                    </div>
                  </div>
                  <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
                    <div className="text-[10px] text-slate-500">Drivetrain</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {selectedVehicle.drivetrain}
                    </div>
                  </div>
                  <div className="col-span-2 p-2.5 rounded border border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500">
                        Exterior Color &amp; Body/Fuel
                      </div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {selectedVehicle.color} · {selectedVehicle.bodyFuelNotes}
                      </div>
                    </div>
                    <span
                      className="w-5 h-5 rounded-full border border-slate-300 shrink-0"
                      style={{ backgroundColor: selectedVehicle.colorHex }}
                    />
                  </div>
                </div>
              </div>

              {/* Unified Financial Snapshot Box */}
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Financial Snapshot (One Profit Everywhere)
                  </h3>
                  <span className="font-mono text-xs text-slate-500">
                    Margin:{' '}
                    {isSensitiveVisible
                      ? `${calculateVehicleMarginPct(
                          selectedVehicle,
                          state.expenses,
                          state.sales
                        )}%`
                      : '••••'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                  <div>
                    <div className="text-[11px] font-sans text-slate-500">
                      Purchase Price
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {fmtMoney(selectedVehicle.purchasePrice, true)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-sans text-slate-500">
                      Recorded Recon Expenses
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {fmtMoney(
                        getVehicleExpensesSum(selectedVehicle.id, state.expenses)
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-sans text-slate-500">
                      Accrued Holding Cost
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {fmtMoney(selectedVehicle.accruedHoldingCost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-sans text-slate-500">
                      Total Investment Cost
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {fmtMoney(
                        calculateVehicleTotalCost(selectedVehicle, state.expenses),
                        true
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-sans text-slate-500">
                      {selectedVehicle.status === 'Sold'
                        ? 'Sold Price'
                        : 'Asking Price'}
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {fmtMoney(
                        selectedVehicle.status === 'Sold'
                          ? selectedVehicle.soldPrice || selectedVehicle.askingPrice
                          : selectedVehicle.askingPrice
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-sans text-slate-500">
                      {selectedVehicle.status === 'Sold'
                        ? 'Realized Net Profit'
                        : 'Projected Net Profit'}
                    </div>
                    <div className="font-bold text-emerald-600 text-sm">
                      {fmtMoney(
                        calculateVehicleNetProfit(
                          selectedVehicle,
                          state.expenses,
                          state.sales
                        ),
                        true
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline Quick Actions pre-linked to this vehicle */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    disabled={!canMutate}
                    onClick={() =>
                      openModal('add_expense', { vehicleId: selectedVehicle.id })
                    }
                    className="flex-1 py-2 px-3 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800 disabled:opacity-50"
                  >
                    + Add expense
                  </button>
                  {selectedVehicle.status !== 'Sold' && (
                    <button
                      type="button"
                      disabled={!canMutate}
                      onClick={() =>
                        openModal('record_sale', { vehicleId: selectedVehicle.id })
                      }
                      style={{ backgroundColor: state.settings.accentColor }}
                      className="flex-1 py-2 px-3 rounded-md text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
                    >
                      Record sale
                    </button>
                  )}
                </div>
              </div>

              {/* Itemized Vehicle Costs List */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Itemized Vehicle Costs (
                  {getVehicleLinkedExpenses(selectedVehicle.id, state.expenses).length})
                </h3>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                  {getVehicleLinkedExpenses(selectedVehicle.id, state.expenses).map(
                    (exp) => (
                      <div
                        key={exp.id}
                        className="p-3 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-medium text-slate-900">
                            {exp.description}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {exp.date} · {exp.category} · Logged by {exp.teamMember}
                          </div>
                        </div>
                        <div className="font-mono font-bold tabular-nums text-slate-900">
                          {fmtMoney(exp.amount)}
                        </div>
                      </div>
                    )
                  )}
                  {getVehicleLinkedExpenses(selectedVehicle.id, state.expenses)
                    .length === 0 && (
                    <div className="p-4 text-center text-slate-400">
                      No reconditioning or repair expenses linked to this vehicle yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
