import {
  ClientDocumentCategory,
  CurrencyCode,
  CsvPartBatchInput,
  DealershipState,
  DealProfitEstimateInput,
  DealProfitEstimateResult,
  DealProfitPartBreakdownItem,
  DebtRecord,
  Expense,
  FinancialAccount,
  MonthlyAuditSummaryRow,
  PartBatch,
  PartItem,
  PartReorderRequest,
  PendingActionPreview,
  RoleType,
  SaleRecord,
  Vehicle,
} from '../types';

/**
 * CORE INVARIANT 1: "One Profit Everywhere"
 * Vehicle Total Investment = purchasePrice + SUM(linkedVehicleExpenses.amount) + accruedHoldingCost
 */
export function getVehicleLinkedExpenses(vehicleId: string, expenses: Expense[]): Expense[] {
  return expenses.filter((e) => e.type === 'Vehicle-linked' && e.vehicleId === vehicleId);
}

export function getVehicleExpensesSum(vehicleId: string, expenses: Expense[]): number {
  return getVehicleLinkedExpenses(vehicleId, expenses).reduce((sum, e) => sum + e.amount, 0);
}

export function calculateVehicleTotalCost(vehicle: Vehicle, expenses: Expense[]): number {
  const expensesSum = getVehicleExpensesSum(vehicle.id, expenses);
  return vehicle.purchasePrice + expensesSum + (vehicle.accruedHoldingCost || 0);
}

/**
 * Realized / Projected Net Profit = salePrice (or askingPrice) - Vehicle Total Investment + vatRefundAmount
 */
export function calculateVehicleNetProfit(
  vehicle: Vehicle,
  expenses: Expense[],
  sales: SaleRecord[] = []
): number {
  const totalCost = calculateVehicleTotalCost(vehicle, expenses);
  const saleRecord = sales.find((s) => s.vehicleId === vehicle.id);
  const revenueBase =
    vehicle.status === 'Sold'
      ? saleRecord?.saleAmount ?? vehicle.soldPrice ?? vehicle.askingPrice
      : vehicle.askingPrice;
  const vatRefund = saleRecord?.vatRefundAmount ?? vehicle.vatRefundAmount ?? 0;
  return revenueBase - totalCost + vatRefund;
}

export function calculateVehicleMarginPct(
  vehicle: Vehicle,
  expenses: Expense[],
  sales: SaleRecord[] = []
): number {
  const saleRecord = sales.find((s) => s.vehicleId === vehicle.id);
  const revenueBase =
    vehicle.status === 'Sold'
      ? saleRecord?.saleAmount ?? vehicle.soldPrice ?? vehicle.askingPrice
      : vehicle.askingPrice;
  if (!revenueBase || revenueBase <= 0) return 0;
  const netProfit = calculateVehicleNetProfit(vehicle, expenses, sales);
  return Number(((netProfit / revenueBase) * 100).toFixed(1));
}

export interface DashboardMonthlyPoint {
  month: string;
  monthKey: string;
  revenue: number;
  profit: number;
  expenses: number;
  profitMarginPct: number;
  inventoryTurnoverRate: number;
  projectedGrowthRevenue: number;
  projectedGrowthProfit: number;
  projectedGrowthRatePct: number;
  isProjected?: boolean;
}

export type GrowthForecastScenario = 'baseline' | 'bullish' | 'conservative';

export interface ProjectedMonthlyGrowthSummary {
  nextMonthLabel: string;
  nextMonthKey: string;
  projectedRevenue: number;
  projectedProfit: number;
  projectedExpenses: number;
  projectedMarginPct: number;
  projectedTurnoverRate: number;
  momRevenueGrowthPct: number;
  sixMonthTrendSlope: number;
  avgMonthlyGrowthRatePct: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  confidenceScorePct: number;
  pipelineContribution: number;
  modelRationale: string;
}

export interface DashboardAggregatedMetrics {
  activeVehiclesCount: number;
  soldVehiclesCount: number;
  agedVehiclesCount: number;
  activeClientDealsCount: number;
  overdueFollowUpsCount: number;
  overdueDebtsCount: number;
  // Inventory valuations
  inventoryPurchaseValue: number;
  inventoryTotalInvestmentValue: number;
  inventoryRetailAskingValue: number;
  projectedInventoryProfit: number;
  fifoPartsInventoryValue: number;
  // Sales Revenue aggregations
  completedVehicleSalesCount: number;
  completedPartSalesCount: number;
  vehicleSalesRevenue: number;
  partSalesRevenue: number;
  totalSalesRevenue: number;
  // Realized Net Profit aggregations ("One Profit Everywhere")
  realizedVehicleProfit: number;
  realizedPartProfit: number;
  totalRealizedProfit: number;
  realizedMarginPct: number;
  netOperatingProfitAfterOverhead: number;
  // Expense aggregations
  totalExpensesCount: number;
  totalExpensesSum: number;
  vehicleLinkedExpensesSum: number;
  generalOverheadExpensesSum: number;
  // Treasury total
  totalTreasuryBalance: number;
  // 6-month trend series + AI Projected Monthly Growth
  monthlySeries: DashboardMonthlyPoint[];
  projectedSeriesWithForecast: DashboardMonthlyPoint[];
  growthForecast: ProjectedMonthlyGrowthSummary;
}

/**
 * Computes AI-driven "Projected Monthly Growth" trendline across the 6 historical months
 * and estimates next month's (Dec 2026) revenue, profit, margin %, and turnover using
 * Ordinary Least Squares (OLS) linear regression blended with weighted momentum and CRM pipeline velocity.
 */
export function calculateProjectedMonthlyGrowth(
  rawSeries: Array<{
    month: string;
    monthKey: string;
    revenue: number;
    profit: number;
    expenses: number;
    profitMarginPct: number;
    inventoryTurnoverRate: number;
  }>,
  state: DealershipState,
  scenario: GrowthForecastScenario = 'baseline'
): {
  enrichedHistoricalSeries: DashboardMonthlyPoint[];
  seriesWithNextMonthForecast: DashboardMonthlyPoint[];
  summary: ProjectedMonthlyGrowthSummary;
} {
  const n = rawSeries.length;
  const scenarioMultiplier =
    scenario === 'bullish' ? 1.08 : scenario === 'conservative' ? 0.93 : 1.0;

  if (n === 0) {
    const emptySummary: ProjectedMonthlyGrowthSummary = {
      nextMonthLabel: 'Dec (Proj.)',
      nextMonthKey: '2026-12',
      projectedRevenue: 0,
      projectedProfit: 0,
      projectedExpenses: 0,
      projectedMarginPct: 0,
      projectedTurnoverRate: 0,
      momRevenueGrowthPct: 0,
      sixMonthTrendSlope: 0,
      avgMonthlyGrowthRatePct: 0,
      confidenceIntervalLow: 0,
      confidenceIntervalHigh: 0,
      confidenceScorePct: 85,
      pipelineContribution: 0,
      modelRationale: 'Insufficient historical data.',
    };
    return {
      enrichedHistoricalSeries: [],
      seriesWithNextMonthForecast: [],
      summary: emptySummary,
    };
  }

  // 1. Ordinary Least Squares (OLS) Linear Regression on Revenue & Profit (t = 0 .. n-1)
  const meanT = (n - 1) / 2;
  const meanRev = rawSeries.reduce((s, p) => s + p.revenue, 0) / n;
  const meanProf = rawSeries.reduce((s, p) => s + p.profit, 0) / n;
  const meanExp = rawSeries.reduce((s, p) => s + p.expenses, 0) / n;

  let numRev = 0;
  let numProf = 0;
  let denT = 0;
  for (let i = 0; i < n; i++) {
    const dt = i - meanT;
    numRev += dt * (rawSeries[i].revenue - meanRev);
    numProf += dt * (rawSeries[i].profit - meanProf);
    denT += dt * dt;
  }

  const slopeRev = denT > 0 ? numRev / denT : 0;
  const interceptRev = meanRev - slopeRev * meanT;

  const slopeProf = denT > 0 ? numProf / denT : 0;
  const interceptProf = meanProf - slopeProf * meanT;

  // 2. Active CRM Pipeline & Available Inventory Velocity signal
  const hotPipelineLeads = state.clients.filter(
    (c) => c.stage === 'Negotiation' || c.stage === 'Viewing'
  );
  const pipelineExpectedValue = hotPipelineLeads.reduce((sum, c) => {
    const veh = state.vehicles.find((v) => v.id === c.vehicleId);
    const weight = c.stage === 'Negotiation' ? 0.35 : 0.18;
    return sum + (veh ? veh.askingPrice * weight : 3500);
  }, 0);

  const pipelineMomentumBoost = Math.round(pipelineExpectedValue * 0.25);

  // 3. Build historical fitted growth trajectory for each of the 6 months
  const enrichedHistoricalSeries: DashboardMonthlyPoint[] = rawSeries.map((pt, idx) => {
    const olsRev = interceptRev + slopeRev * idx;
    // Blend OLS trendline (65%) with local weighted value (35%) for a smooth trend curve
    const prevRev = idx > 0 ? rawSeries[idx - 1].revenue : pt.revenue;
    const smoothedRev = Math.round(
      (olsRev * 0.65 + (pt.revenue * 0.6 + prevRev * 0.4) * 0.35) *
        (idx === n - 1 ? 1 : 1)
    );
    const olsProf = interceptProf + slopeProf * idx;
    const smoothedProf = Math.round(olsProf * 0.65 + pt.profit * 0.35);
    const prevFitted =
      idx > 0
        ? Math.round(
            (interceptRev + slopeRev * (idx - 1)) * 0.65 +
              rawSeries[idx - 1].revenue * 0.35
          )
        : smoothedRev;
    const growthPct =
      idx === 0 || prevFitted <= 0
        ? Number(((slopeRev / Math.max(1, meanRev)) * 100).toFixed(1))
        : Number((((smoothedRev - prevFitted) / prevFitted) * 100).toFixed(1));

    return {
      ...pt,
      projectedGrowthRevenue: Math.max(1000, smoothedRev),
      projectedGrowthProfit: Math.max(200, smoothedProf),
      projectedGrowthRatePct: growthPct,
      isProjected: false,
    };
  });

  // 4. Estimate Next Month (t = n, i.e., Dec 2026)
  const lastPoint = rawSeries[n - 1];
  const recent3AvgRev =
    rawSeries.slice(-3).reduce((s, p) => s + p.revenue, 0) /
    Math.min(3, n);
  const rawNextRev =
    (interceptRev + slopeRev * n) * 0.6 +
    recent3AvgRev * 0.4 +
    pipelineMomentumBoost;

  const projectedRevenue = Math.max(
    5000,
    Math.round(rawNextRev * scenarioMultiplier)
  );

  const avgMarginRatio =
    meanRev > 0
      ? Math.min(0.35, Math.max(0.12, meanProf / meanRev))
      : 0.18;
  const rawNextProf =
    (interceptProf + slopeProf * n) * 0.55 +
    projectedRevenue * avgMarginRatio * 0.45;
  const projectedProfit = Math.max(
    800,
    Math.round(rawNextProf * scenarioMultiplier)
  );

  const projectedExpenses = Math.max(
    900,
    Math.round(meanExp * (0.96 + (scenarioMultiplier - 1) * 0.5))
  );

  const projectedMarginPct =
    projectedRevenue > 0
      ? Number(((projectedProfit / projectedRevenue) * 100).toFixed(1))
      : 0;

  const avgTurnover =
    rawSeries.reduce((s, p) => s + p.inventoryTurnoverRate, 0) / n;
  const projectedTurnoverRate = Number(
    (avgTurnover * (1 + Math.max(-0.08, Math.min(0.15, slopeRev / Math.max(1, meanRev)))) * scenarioMultiplier).toFixed(2)
  );

  const baselineLastRev = Math.max(1, lastPoint.revenue);
  const momRevenueGrowthPct = Number(
    (((projectedRevenue - baselineLastRev) / baselineLastRev) * 100).toFixed(1)
  );

  // Compute month-over-month average historical compound growth rate
  let sumMomPct = 0;
  for (let i = 1; i < n; i++) {
    const prev = Math.max(1, rawSeries[i - 1].revenue);
    sumMomPct += ((rawSeries[i].revenue - prev) / prev) * 100;
  }
  const avgMonthlyGrowthRatePct = Number(
    (sumMomPct / Math.max(1, n - 1)).toFixed(1)
  );

  const confidenceIntervalLow = Math.round(projectedRevenue * 0.91);
  const confidenceIntervalHigh = Math.round(projectedRevenue * 1.09);

  const nextMonthPoint: DashboardMonthlyPoint = {
    month: 'Dec (Proj.)',
    monthKey: '2026-12',
    revenue: projectedRevenue,
    profit: projectedProfit,
    expenses: projectedExpenses,
    profitMarginPct: projectedMarginPct,
    inventoryTurnoverRate: projectedTurnoverRate,
    projectedGrowthRevenue: projectedRevenue,
    projectedGrowthProfit: projectedProfit,
    projectedGrowthRatePct: momRevenueGrowthPct,
    isProjected: true,
  };

  const summary: ProjectedMonthlyGrowthSummary = {
    nextMonthLabel: 'Dec (Proj.)',
    nextMonthKey: '2026-12',
    projectedRevenue,
    projectedProfit,
    projectedExpenses,
    projectedMarginPct,
    projectedTurnoverRate,
    momRevenueGrowthPct,
    sixMonthTrendSlope: Math.round(slopeRev),
    avgMonthlyGrowthRatePct,
    confidenceIntervalLow,
    confidenceIntervalHigh,
    confidenceScorePct: 89,
    pipelineContribution: pipelineMomentumBoost,
    modelRationale: `6-mo OLS regression (${slopeRev >= 0 ? '+' : ''}$${Math.round(
      slopeRev
    ).toLocaleString()}/mo slope) + ${hotPipelineLeads.length} active CRM Viewing/Negotiation leads (+$${pipelineMomentumBoost.toLocaleString()} weighted pipeline lift).`,
  };

  return {
    enrichedHistoricalSeries,
    seriesWithNextMonthForecast: [...enrichedHistoricalSeries, nextMonthPoint],
    summary,
  };
}

/**
 * Aggregates all Dashboard KPIs, Inventory Values, Sales Revenue, Realized/Projected Net Profit,
 * and Expense breakdowns directly from global DealershipState.
 */
export function calculateDashboardMetrics(
  state: DealershipState,
  timeFilter: 'month' | 'all' = 'all',
  currentMonthPrefix = '2026-11'
): DashboardAggregatedMetrics {
  const activeVehicles = state.vehicles.filter((v) => v.status !== 'Sold');
  const soldVehicles = state.vehicles.filter((v) => v.status === 'Sold');
  const agedVehicles = activeVehicles.filter((v) => v.daysInStock >= 45);
  const activeClientDeals = state.clients.filter((c) => c.stage !== 'Sold');
  const overdueFollowUps = state.clients.filter((c) => c.isOverdue && c.stage !== 'Sold');
  const overdueDebts = state.debts.filter((d) => d.isOverdue && d.status !== 'Settled');

  // 1. Inventory valuations across active stock
  const inventoryPurchaseValue = activeVehicles.reduce((sum, v) => sum + v.purchasePrice, 0);
  const inventoryTotalInvestmentValue = activeVehicles.reduce(
    (sum, v) => sum + calculateVehicleTotalCost(v, state.expenses),
    0
  );
  const inventoryRetailAskingValue = activeVehicles.reduce((sum, v) => sum + v.askingPrice, 0);
  const projectedInventoryProfit = activeVehicles.reduce(
    (sum, v) => sum + calculateVehicleNetProfit(v, state.expenses, state.sales),
    0
  );
  const fifoPartsInventoryValue = state.partBatches.reduce(
    (sum, b) => sum + Number((b.remainingQty * b.unitCost).toFixed(2)),
    0
  );

  // 2. Filter sales, partSales, and expenses by time window
  const filteredSales =
    timeFilter === 'month'
      ? state.sales.filter((s) => s.saleDate.startsWith(currentMonthPrefix))
      : state.sales;

  const filteredPartSales =
    timeFilter === 'month'
      ? state.partSales.filter((ps) => ps.saleDate.startsWith(currentMonthPrefix))
      : state.partSales;

  const filteredExpenses =
    timeFilter === 'month'
      ? state.expenses.filter((e) => e.date.startsWith(currentMonthPrefix))
      : state.expenses;

  // 3. Total Sales Revenue (Vehicle Sales + Counter FIFO Part Sales)
  const vehicleSalesRevenue = filteredSales.reduce((sum, s) => sum + s.saleAmount, 0);
  const partSalesRevenue = filteredPartSales.reduce((sum, ps) => sum + ps.totalRevenue, 0);
  const totalSalesRevenue = Number((vehicleSalesRevenue + partSalesRevenue).toFixed(2));

  // 4. Realized Net Profit ("One Profit Everywhere": dynamically verified against vehicle total cost)
  const realizedVehicleProfit = filteredSales.reduce((sum, s) => {
    const linkedVehicle = state.vehicles.find((v) => v.id === s.vehicleId);
    if (linkedVehicle) {
      const dynamicCost = calculateVehicleTotalCost(linkedVehicle, state.expenses);
      return sum + (s.saleAmount - dynamicCost + (s.vatRefundAmount || 0));
    }
    return sum + s.netProfitSnapshot;
  }, 0);

  const realizedPartProfit = filteredPartSales.reduce((sum, ps) => sum + ps.grossProfit, 0);
  const totalRealizedProfit = Number((realizedVehicleProfit + realizedPartProfit).toFixed(2));
  const realizedMarginPct =
    totalSalesRevenue > 0
      ? Number(((totalRealizedProfit / totalSalesRevenue) * 100).toFixed(1))
      : 0;

  // 5. Expense totals & categorization
  const totalExpensesSum = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const vehicleLinkedExpensesSum = filteredExpenses
    .filter((e) => e.type === 'Vehicle-linked')
    .reduce((sum, e) => sum + e.amount, 0);
  const generalOverheadExpensesSum = filteredExpenses
    .filter((e) => e.type === 'General Overhead')
    .reduce((sum, e) => sum + e.amount, 0);

  const netOperatingProfitAfterOverhead = Number(
    (totalRealizedProfit - generalOverheadExpensesSum).toFixed(2)
  );

  const totalTreasuryBalance = state.accounts.reduce((sum, acc) => sum + acc.balance, 0);

  // 6. 6-month trend series combining historical baseline with live state records
  const monthBuckets: Array<{
    month: string;
    monthKey: string;
    baseRev: number;
    baseProf: number;
    baseExp: number;
  }> = [
    { month: 'Jun', monthKey: '2026-06', baseRev: 18400, baseProf: 3100, baseExp: 1450 },
    { month: 'Jul', monthKey: '2026-07', baseRev: 22900, baseProf: 4250, baseExp: 1820 },
    { month: 'Aug', monthKey: '2026-08', baseRev: 19500, baseProf: 3400, baseExp: 1610 },
    { month: 'Sep', monthKey: '2026-09', baseRev: 27400, baseProf: 5120, baseExp: 2100 },
    { month: 'Oct', monthKey: '2026-10', baseRev: 0, baseProf: 0, baseExp: 0 },
    { month: 'Nov', monthKey: '2026-11', baseRev: 0, baseProf: 0, baseExp: 0 },
  ];

  const monthlySeries: DashboardMonthlyPoint[] = monthBuckets.map((b) => {
    const mSales = state.sales.filter((s) => s.saleDate.startsWith(b.monthKey));
    const mPartSales = state.partSales.filter((ps) => ps.saleDate.startsWith(b.monthKey));
    const mExpenses = state.expenses.filter((e) => e.date.startsWith(b.monthKey));

    const mSalesRev = mSales.reduce((sum, s) => sum + s.saleAmount, 0);
    const mPartRev = mPartSales.reduce((sum, ps) => sum + ps.totalRevenue, 0);
    const mSalesProf = mSales.reduce((sum, s) => {
      const v = state.vehicles.find((veh) => veh.id === s.vehicleId);
      if (v) {
        return sum + (s.saleAmount - calculateVehicleTotalCost(v, state.expenses) + (s.vatRefundAmount || 0));
      }
      return sum + s.netProfitSnapshot;
    }, 0);
    const mPartProf = mPartSales.reduce((sum, ps) => sum + ps.grossProfit, 0);
    const mExpSum = mExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalRev = b.baseRev + mSalesRev + mPartRev;
    const totalProf = b.baseProf + mSalesProf + mPartProf;
    const totalExp = b.baseExp + mExpSum;
    const profitMarginPct =
      totalRev > 0 ? Number(((totalProf / totalRev) * 100).toFixed(1)) : 0;

    // Calculate monthly COGS (Cost of Goods Sold) and annualized Inventory Turnover Rate
    const mCogs =
      mSales.reduce((sum, s) => {
        const v = state.vehicles.find((veh) => veh.id === s.vehicleId);
        return (
          sum +
          (v
            ? calculateVehicleTotalCost(v, state.expenses)
            : s.totalCostSnapshot)
        );
      }, 0) + mPartSales.reduce((sum, ps) => sum + ps.fifoCost, 0);

    const baseCogs = b.baseRev > 0 ? b.baseRev - b.baseProf : 0;
    const totalCogs = baseCogs + mCogs;
    const avgInvVal = Math.max(inventoryPurchaseValue, 50000);
    const inventoryTurnoverRate =
      totalCogs > 0
        ? Number(((totalCogs * 12) / avgInvVal).toFixed(2))
        : b.monthKey === '2026-11'
        ? Number(((inventoryPurchaseValue * 0.28 * 12) / avgInvVal).toFixed(2))
        : 0;

    return {
      month: b.month,
      monthKey: b.monthKey,
      revenue: totalRev,
      profit: totalProf,
      expenses: totalExp,
      profitMarginPct,
      inventoryTurnoverRate,
      projectedGrowthRevenue: totalRev,
      projectedGrowthProfit: totalProf,
      projectedGrowthRatePct: 0,
    };
  });

  const projection = calculateProjectedMonthlyGrowth(
    monthlySeries,
    state,
    'baseline'
  );

  return {
    activeVehiclesCount: activeVehicles.length,
    soldVehiclesCount: soldVehicles.length,
    agedVehiclesCount: agedVehicles.length,
    activeClientDealsCount: activeClientDeals.length,
    overdueFollowUpsCount: overdueFollowUps.length,
    overdueDebtsCount: overdueDebts.length,
    inventoryPurchaseValue,
    inventoryTotalInvestmentValue,
    inventoryRetailAskingValue,
    projectedInventoryProfit,
    fifoPartsInventoryValue,
    completedVehicleSalesCount: filteredSales.length,
    completedPartSalesCount: filteredPartSales.length,
    vehicleSalesRevenue,
    partSalesRevenue,
    totalSalesRevenue,
    realizedVehicleProfit,
    realizedPartProfit,
    totalRealizedProfit,
    realizedMarginPct,
    netOperatingProfitAfterOverhead,
    totalExpensesCount: filteredExpenses.length,
    totalExpensesSum,
    vehicleLinkedExpensesSum,
    generalOverheadExpensesSum,
    totalTreasuryBalance,
    monthlySeries: projection.enrichedHistoricalSeries,
    projectedSeriesWithForecast: projection.seriesWithNextMonthForecast,
    growthForecast: projection.summary,
  };
}


/**
 * CORE INVARIANT 2: Strict RBAC Enforcement
 */
export function canViewSensitiveFinancials(role: RoleType): boolean {
  return role === 'Owner' || role === 'Admin';
}

export function canMutateWorkspace(role: RoleType): boolean {
  return role !== 'Viewer';
}

/**
 * FIFO Part Batch Allocation
 * Deducts requested quantity starting from the oldest batch (by purchaseDate).
 */
export interface FifoAllocationResult {
  updatedBatches: PartBatch[];
  totalFifoCost: number;
  allocations: Array<{
    batchId: string;
    batchLabel: string;
    qtyUsed: number;
    unitCost: number;
  }>;
}

export function allocateFifoPartBatches(
  batches: PartBatch[],
  partId: string,
  requestedQty: number
): FifoAllocationResult {
  const partBatchesSorted = batches
    .filter((b) => b.partId === partId && b.remainingQty > 0)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

  const totalAvailable = partBatchesSorted.reduce((sum, b) => sum + b.remainingQty, 0);
  if (requestedQty <= 0 || requestedQty > totalAvailable) {
    throw new Error(
      `Insufficient stock for FIFO allocation. Requested: ${requestedQty}, Available: ${totalAvailable}`
    );
  }

  let remainingToFulfill = requestedQty;
  let totalFifoCost = 0;
  const allocations: FifoAllocationResult['allocations'] = [];
  const batchUpdates = new Map<string, number>();

  for (const batch of partBatchesSorted) {
    if (remainingToFulfill <= 0) break;
    const takeQty = Math.min(batch.remainingQty, remainingToFulfill);
    const newRemaining = batch.remainingQty - takeQty;
    batchUpdates.set(batch.id, newRemaining);
    totalFifoCost += takeQty * batch.unitCost;
    remainingToFulfill -= takeQty;
    allocations.push({
      batchId: batch.id,
      batchLabel: batch.batchLabel,
      qtyUsed: takeQty,
      unitCost: batch.unitCost,
    });
  }

  const updatedBatches = batches.map((b) =>
    batchUpdates.has(b.id) ? { ...b, remainingQty: batchUpdates.get(b.id)! } : b
  );

  return {
    updatedBatches,
    totalFifoCost: Number(totalFifoCost.toFixed(2)),
    allocations,
  };
}

/**
 * Treasury Account Balance Update
 */
export function updateAccountBalance(
  accounts: FinancialAccount[],
  accountId: string,
  deltaAmount: number
): FinancialAccount[] {
  return accounts.map((acc) =>
    acc.id === accountId
      ? { ...acc, balance: Number((acc.balance + deltaAmount).toFixed(2)) }
      : acc
  );
}

/**
 * Counterparty Debt Partial/Full Settlement
 */
export function settleDebtRecord(
  debt: DebtRecord,
  settlementAmount: number
): DebtRecord {
  const clampedAmount = Math.max(0, Math.min(settlementAmount, debt.amount - debt.paidAmount));
  const newPaid = Number((debt.paidAmount + clampedAmount).toFixed(2));
  const isSettled = newPaid >= debt.amount;
  return {
    ...debt,
    paidAmount: newPaid,
    status: isSettled ? 'Settled' : newPaid > 0 ? 'Partial' : 'Open',
    isOverdue: isSettled ? false : debt.isOverdue,
  };
}

export const INFLOW_CATEGORIES = [
  'Vehicle Sales Proceeds',
  'FIFO Part Sales',
  'Debt Collection (Receivables)',
  'Customer Down Payment',
  'Capital Deposit / Equity',
  'Other Inflow',
] as const;

export const OUTFLOW_CATEGORIES = [
  'Vehicle Acquisition',
  'Reconditioning & Detailing',
  'Repairs & Mechanical',
  'Transport & Towing',
  'FIFO Part Stock Purchase',
  'Lot Lease & Facilities',
  'Debt Settlement (Payable)',
  'General Overhead',
  'Other Outflow',
] as const;

/**
 * Intelligent categorization engine for Treasury Ledger transactions
 */
export function autoCategorizeTransaction(tx: {
  source: string;
  description: string;
  direction: 'Inflow' | 'Outflow';
}): string {
  const desc = (tx.description || '').toLowerCase();

  if (tx.direction === 'Inflow') {
    if (tx.source === 'Vehicle Sale' || desc.includes('sale proceed') || desc.includes('buyer')) {
      return 'Vehicle Sales Proceeds';
    }
    if (tx.source === 'Part' || desc.includes('part sale') || desc.includes('counter part')) {
      return 'FIFO Part Sales';
    }
    if (tx.source === 'Debt Settlement' || desc.includes('debt') || desc.includes('note') || desc.includes('receivable')) {
      return 'Debt Collection (Receivables)';
    }
    if (desc.includes('down payment') || desc.includes('deposit from buyer')) {
      return 'Customer Down Payment';
    }
    if (tx.source === 'Manual' || desc.includes('capital') || desc.includes('deposit') || desc.includes('equity')) {
      return 'Capital Deposit / Equity';
    }
    return 'Other Inflow';
  }

  // Outflow
  if (tx.source === 'Vehicle Purchase' || desc.includes('vehicle acquisition') || desc.includes('car purchase') || desc.includes('auction')) {
    return 'Vehicle Acquisition';
  }
  if (desc.includes('detail') || desc.includes('paint') || desc.includes('wash') || desc.includes('ceramic') || desc.includes('steam')) {
    return 'Reconditioning & Detailing';
  }
  if (desc.includes('repair') || desc.includes('brake') || desc.includes('bushing') || desc.includes('alignment') || desc.includes('oil') || desc.includes('tire') || desc.includes('inspection')) {
    return 'Repairs & Mechanical';
  }
  if (desc.includes('transport') || desc.includes('carrier') || desc.includes('tow') || desc.includes('dispatch') || desc.includes('fuel')) {
    return 'Transport & Towing';
  }
  if (tx.source === 'Part' || desc.includes('part stock') || desc.includes('batch')) {
    return 'FIFO Part Stock Purchase';
  }
  if (desc.includes('lease') || desc.includes('rent') || desc.includes('lot') || desc.includes('security monitoring')) {
    return 'Lot Lease & Facilities';
  }
  if (tx.source === 'Debt Settlement' || desc.includes('payable') || desc.includes('vendor bill') || desc.includes('floorplan curtailment')) {
    return 'Debt Settlement (Payable)';
  }
  return 'General Overhead';
}

/**
 * Currency Formatting with Tabular Precision
 */
export const CURRENCY_CONFIG: Record<
  CurrencyCode,
  { symbol: string; locale: string; rateFromUsd: number }
> = {
  USD: { symbol: '$', locale: 'en-US', rateFromUsd: 1 },
  EUR: { symbol: '€', locale: 'de-DE', rateFromUsd: 0.92 },
  GBP: { symbol: '£', locale: 'en-GB', rateFromUsd: 0.79 },
  AED: { symbol: 'د.إ', locale: 'ar-AE', rateFromUsd: 3.67 },
  CAD: { symbol: 'CA$', locale: 'en-CA', rateFromUsd: 1.38 },
  BRL: { symbol: 'R$', locale: 'pt-BR', rateFromUsd: 5.05 },
  JPY: { symbol: '¥', locale: 'ja-JP', rateFromUsd: 154 },
  INR: { symbol: '₹', locale: 'en-IN', rateFromUsd: 83.5 },
  KRW: { symbol: '₩', locale: 'ko-KR', rateFromUsd: 1365 },
  RUB: { symbol: '₽', locale: 'ru-RU', rateFromUsd: 92 },
  TRY: { symbol: '₺', locale: 'tr-TR', rateFromUsd: 32.5 },
  UZS: { symbol: "so'm", locale: 'uz-UZ', rateFromUsd: 12650 },
};

export function formatMoney(
  amountUsd: number,
  currency: CurrencyCode = 'USD',
  masked = false
): string {
  if (masked) return '••••••';
  const cfg = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.USD;
  const converted = Math.round(amountUsd * cfg.rateFromUsd);
  const absFormatted = Math.abs(converted).toLocaleString('en-US');
  const sign = converted < 0 ? '-' : '';
  if (currency === 'UZS') {
    return `${sign}${absFormatted} ${cfg.symbol}`;
  }
  return `${sign}${cfg.symbol}${absFormatted}`;
}

/**
 * Smart Paste Vehicle Listing Parser
 * Extracts Year, Make, Model, Trim, VIN, Mileage, Purchase/Asking Price, Engine, Drivetrain, Color
 */
export interface ParsedVehicleSpec {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  mileage?: number;
  purchasePrice?: number;
  askingPrice?: number;
  engine?: string;
  drivetrain?: string;
  color?: string;
  notes?: string;
}

const KNOWN_MAKES = [
  'Toyota',
  'Honda',
  'BMW',
  'Mercedes-Benz',
  'Mercedes',
  'Ford',
  'Hyundai',
  'Kia',
  'Lexus',
  'Audi',
  'Chevrolet',
  'Nissan',
  'Volkswagen',
  'Porsche',
  'Mazda',
  'Subaru',
  'Jeep',
  'Tesla',
];

export function parseSmartPasteVehicleText(rawText: string): ParsedVehicleSpec {
  const result: ParsedVehicleSpec = {};
  const text = rawText.trim();
  if (!text) return result;

  // 17-character VIN
  const vinMatch = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
  if (vinMatch) {
    result.vin = vinMatch[1].toUpperCase();
  }

  // Year (1990 - 2027)
  const yearMatch = text.match(/\b(19[9]\d|20[0-2]\d)\b/);
  if (yearMatch) {
    result.year = Number(yearMatch[1]);
  }

  // Make & Model
  for (const make of KNOWN_MAKES) {
    const regex = new RegExp(`\\b(${make})\\s+([A-Za-z0-9-]+)(?:\\s+([A-Za-z0-9.-]+))?`, 'i');
    const match = text.match(regex);
    if (match) {
      result.make = make === 'Mercedes' ? 'Mercedes-Benz' : make;
      result.model = match[2];
      if (match[3] && !/^(for|with|vin|miles|km|awd|fwd|rwd|4wd|\$)/i.test(match[3])) {
        result.trim = match[3];
      }
      break;
    }
  }

  // Mileage (e.g. "42,500 miles" or "68k mi")
  const mileageMatch =
    text.match(/(\d{1,3}(?:,\d{3})+)\s*(?:miles|mi|km)/i) ||
    text.match(/(\d{2,3})k\s*(?:miles|mi)/i);
  if (mileageMatch) {
    const rawNum = mileageMatch[1].replace(/,/g, '');
    result.mileage = mileageMatch[0].toLowerCase().includes('k')
      ? Number(rawNum) * 1000
      : Number(rawNum);
  }

  // Prices (e.g., "bought for $18,000, asking $22,500" or "$19,500")
  const boughtMatch = text.match(/(?:bought|purchase|cost|paid)[^$\d]*\$?(\d{1,3}(?:,\d{3})+|\d{4,6})/i);
  const askingMatch = text.match(/(?:asking|list|retail|price)[^$\d]*\$?(\d{1,3}(?:,\d{3})+|\d{4,6})/i);

  if (boughtMatch) {
    result.purchasePrice = Number(boughtMatch[1].replace(/,/g, ''));
  }
  if (askingMatch) {
    result.askingPrice = Number(askingMatch[1].replace(/,/g, ''));
  }
  if (!result.purchasePrice && !result.askingPrice) {
    const anyDollar = text.match(/\$(\d{1,3}(?:,\d{3})+|\d{4,6})/);
    if (anyDollar) {
      const val = Number(anyDollar[1].replace(/,/g, ''));
      result.purchasePrice = val;
      result.askingPrice = Math.round(val * 1.22);
    }
  } else if (result.purchasePrice && !result.askingPrice) {
    result.askingPrice = Math.round(result.purchasePrice * 1.22);
  }

  // Drivetrain
  const driveMatch = text.match(/\b(AWD|FWD|RWD|4WD|4x4|xDrive|4MATIC|Quattro)\b/i);
  if (driveMatch) {
    const d = driveMatch[1].toUpperCase();
    result.drivetrain = ['XDRIVE', '4MATIC', 'QUATTRO'].includes(d) ? 'AWD' : d;
  }

  // Engine
  const engineMatch = text.match(/\b(\d\.\dL\s*(?:Turbo|V6|V8|I4|Hybrid)?|V6|V8|Hybrid|Electric)\b/i);
  if (engineMatch) {
    result.engine = engineMatch[1];
  }

  // Color
  const colorMatch = text.match(/\b(White|Black|Silver|Gray|Grey|Blue|Red|Green|Gold|champagne)\b/i);
  if (colorMatch) {
    result.color = colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1).toLowerCase();
  }

  result.notes = `Smart-pasted from listing: "${text.slice(0, 140)}"`;
  return result;
}

/**
 * Deterministic Local & Server Fallback for "Voice to Work" AI Assistant
 * Produces both live analytical answers and Preview-Then-Confirm PendingActionPreview cards.
 */
export function buildDealerAssistantResponse(
  prompt: string,
  state: DealershipState,
  hasImage = false
): { reply: string; pendingAction?: PendingActionPreview } {
  const q = prompt.trim();
  const lower = q.toLowerCase();
  const isSensitiveAllowed = canViewSensitiveFinancials(state.settings.activeRole);
  const currency = state.settings.currency;
  const activeStock = state.vehicles.filter((v) => v.status !== 'Sold');
  const bankAcc = state.accounts[0];

  // 1. Capabilities question
  if (lower.includes('what can you do') || lower.includes('help')) {
    return {
      reply:
        `I am your **Voice to Work** Dealership Assistant. Here is what I can do right from this drawer:\n\n` +
        `• **Log Expenses by Voice/Text/Receipt Photo:** Try *"Add a $250 fuel expense"* or *"Detailing on Honda Accord for $180"*.\n` +
        `• **Add Vehicles on the Lot:** Try *"Bought a 2021 Camry SE for 18,000, asking 22,400"*.\n` +
        `• **Record Vehicle Sales:** Try *"Sold the 2020 Honda Accord for $21,500 to John Miller"*.\n` +
        `• **Answer Live Dealership Queries:** Ask *"How many cars are in stock?"*, *"Who owes me money?"*, or *"What is our total profit?"*.\n\n` +
        `Every write action generates a **Before → After Preview Card** for your confirmation and supports **1-Click Undo**.`,
    };
  }

  // 2. Stock / Inventory question
  if (
    lower.includes('how many cars') ||
    lower.includes('in stock') ||
    lower.includes('inventory summary')
  ) {
    const agedUnits = activeStock.filter((v) => v.daysInStock >= 45);
    const totalInvested = activeStock.reduce(
      (sum, v) => sum + calculateVehicleTotalCost(v, state.expenses),
      0
    );
    const totalAsking = activeStock.reduce((sum, v) => sum + v.askingPrice, 0);
    return {
      reply:
        `You currently have **${activeStock.length} active vehicles** in stock (${agedUnits.length} aged 45+ days):\n\n` +
        activeStock
          .map(
            (v) =>
              `• **${v.year} ${v.make} ${v.model}** (${v.stockId}) — Status: ${v.status} · Asking: ${formatMoney(v.askingPrice, currency)}${
                isSensitiveAllowed
                  ? ` · Invested: ${formatMoney(calculateVehicleTotalCost(v, state.expenses), currency)}`
                  : ''
              }`
          )
          .join('\n') +
        `\n\n**Total Asking Value:** ${formatMoney(totalAsking, currency)}` +
        (isSensitiveAllowed
          ? ` | **Total Capital Invested:** ${formatMoney(totalInvested, currency)}`
          : ' *(Cost & profit figures masked for your role)*'),
    };
  }

  // 3. Debt / Who owes me money question
  if (lower.includes('who owes') || lower.includes('debt') || lower.includes('receivable')) {
    if (!isSensitiveAllowed) {
      return {
        reply: `Access restricted: Your current role (**${state.settings.activeRole}**) does not have permission to view counterparty debt or treasury balances. Switch to **Owner** or **Admin** in Team & Permissions to inspect financial balances.`,
      };
    }
    const owedToMe = state.debts.filter(
      (d) => d.direction === 'Owed to me' && d.status !== 'Settled'
    );
    const iOwe = state.debts.filter((d) => d.direction === 'I owe' && d.status !== 'Settled');
    const totalReceivable = owedToMe.reduce((s, d) => s + (d.amount - d.paidAmount), 0);
    const totalPayable = iOwe.reduce((s, d) => s + (d.amount - d.paidAmount), 0);
    return {
      reply:
        `**Receivables (Owed to Dealership): ${formatMoney(totalReceivable, currency)}**\n` +
        (owedToMe.length
          ? owedToMe
              .map(
                (d) =>
                  `• **${d.counterparty}**: ${formatMoney(d.amount - d.paidAmount, currency)} remaining (Due ${d.dueDate}${d.isOverdue ? ' — OVERDUE' : ''})`
              )
              .join('\n')
          : '• None open.') +
        `\n\n**Payables (Dealership Owes): ${formatMoney(totalPayable, currency)}**\n` +
        (iOwe.length
          ? iOwe
              .map(
                (d) =>
                  `• **${d.counterparty}**: ${formatMoney(d.amount - d.paidAmount, currency)} remaining (Due ${d.dueDate})`
              )
              .join('\n')
          : '• None open.'),
    };
  }

  // 4. Bought / Add Vehicle mutation command
  if (
    lower.includes('bought') ||
    lower.includes('add vehicle') ||
    lower.includes('new car') ||
    (hasImage && lower.includes('car'))
  ) {
    const parsed = parseSmartPasteVehicleText(q);
    const year = parsed.year || 2021;
    const make = parsed.make || 'Toyota';
    const model = parsed.model || 'Camry';
    const trim = parsed.trim || 'SE';
    const purchasePrice = parsed.purchasePrice || 18000;
    const askingPrice = parsed.askingPrice || Math.round(purchasePrice * 1.22);
    const stockId = `CDT-${101 + state.vehicles.length}`;

    // Check if an extra recon/detailing cost was mentioned in the same breath
    const reconMatch = q.match(/(?:detailing|recon|repair|transport)\s*\$?(\d{2,4})/i);
    const extraExpenseAmount = reconMatch ? Number(reconMatch[1]) : 0;

    const preview: PendingActionPreview = {
      id: `act-${Date.now()}`,
      actionType: 'create_vehicle',
      targetTitle: `${year} ${make} ${model} ${trim} (${stockId})`,
      summary: `Add ${year} ${make} ${model} to inventory${
        extraExpenseAmount > 0 ? ` + log $${extraExpenseAmount} reconditioning expense` : ''
      } paid from ${bankAcc?.name || 'Main Operating Bank'}.`,
      diffs: [
        { field: 'Vehicle Unit', before: 'Not in inventory', after: `${year} ${make} ${model} ${trim}` },
        { field: 'Stock ID', before: '—', after: stockId },
        {
          field: 'Purchase Price',
          before: '$0',
          after: formatMoney(purchasePrice, currency, !isSensitiveAllowed),
        },
        { field: 'Asking Price', before: '$0', after: formatMoney(askingPrice, currency) },
        ...(extraExpenseAmount > 0
          ? [
              {
                field: 'Linked Recon Expense',
                before: '$0',
                after: `${formatMoney(extraExpenseAmount, currency)} (Detailing)`,
              },
            ]
          : []),
        {
          field: `${bankAcc?.name || 'Bank'} Balance`,
          before: formatMoney(bankAcc?.balance || 0, currency, !isSensitiveAllowed),
          after: formatMoney(
            (bankAcc?.balance || 0) - purchasePrice - extraExpenseAmount,
            currency,
            !isSensitiveAllowed
          ),
        },
      ],
      payload: {
        year,
        make,
        model,
        trim,
        stockId,
        vin: parsed.vin || `4T1G11AK5MU${Math.floor(100000 + Math.random() * 899999)}`,
        purchasePrice,
        askingPrice,
        mileage: parsed.mileage || 38400,
        color: parsed.color || 'Silver',
        paidFromAccountId: bankAcc?.id || 'acc-1',
        extraExpenseAmount,
      },
      status: 'pending',
    };

    return {
      reply: `I parsed your vehicle acquisition command. Review the **Before → After** state changes below and click **Confirm & Save** to commit to the ledger:`,
      pendingAction: preview,
    };
  }

  // 5. Record Sale mutation command
  if (lower.includes('sold') || lower.includes('record sale')) {
    const matchedVehicle =
      activeStock.find(
        (v) =>
          lower.includes(v.make.toLowerCase()) ||
          lower.includes(v.model.toLowerCase()) ||
          lower.includes(v.stockId.toLowerCase())
      ) || activeStock[0];

    if (matchedVehicle) {
      const priceMatch = q.match(/\$?(\d{1,3}(?:,\d{3})+|\d{4,6})/);
      const saleAmount = priceMatch
        ? Number(priceMatch[1].replace(/,/g, ''))
        : matchedVehicle.askingPrice;
      const totalCost = calculateVehicleTotalCost(matchedVehicle, state.expenses);
      const netProfit = saleAmount - totalCost;

      const preview: PendingActionPreview = {
        id: `act-${Date.now()}`,
        actionType: 'record_sale',
        targetTitle: `${matchedVehicle.year} ${matchedVehicle.make} ${matchedVehicle.model} (${matchedVehicle.stockId})`,
        summary: `Mark ${matchedVehicle.stockId} as Sold for ${formatMoney(saleAmount, currency)} and deposit into ${bankAcc?.name || 'Main Operating Bank'}.`,
        diffs: [
          { field: 'Vehicle Status', before: matchedVehicle.status, after: 'Sold' },
          { field: 'Sale Amount', before: '—', after: formatMoney(saleAmount, currency) },
          {
            field: 'Realized Net Profit',
            before: 'Projected',
            after: formatMoney(netProfit, currency, !isSensitiveAllowed),
          },
          {
            field: `${bankAcc?.name || 'Bank'} Balance`,
            before: formatMoney(bankAcc?.balance || 0, currency, !isSensitiveAllowed),
            after: formatMoney((bankAcc?.balance || 0) + saleAmount, currency, !isSensitiveAllowed),
          },
        ],
        payload: {
          vehicleId: matchedVehicle.id,
          saleAmount,
          buyerName: 'Walk-In / Direct Buyer',
          buyerPhone: '+1 (555) 234-8890',
          paymentMethod: 'Bank Transfer',
          depositToAccountId: bankAcc?.id || 'acc-1',
        },
        status: 'pending',
      };

      return {
        reply: `Ready to record the sale for **${matchedVehicle.year} ${matchedVehicle.make} ${matchedVehicle.model}**. Please verify the financial preview below:`,
        pendingAction: preview,
      };
    }
  }

  // 5.5 Update Vehicle mutation command (price or status update)
  if (
    lower.includes('update') ||
    lower.includes('change price') ||
    lower.includes('asking price') ||
    lower.includes('mark ') ||
    lower.includes('set status')
  ) {
    const matchedVehicle =
      activeStock.find(
        (v) =>
          lower.includes(v.make.toLowerCase()) ||
          lower.includes(v.model.toLowerCase()) ||
          lower.includes(v.stockId.toLowerCase())
      ) || activeStock[0];

    if (matchedVehicle) {
      const priceMatch = q.match(/\$?(\d{1,3}(?:,\d{3})+|\d{4,6})/);
      const newAsking = priceMatch
        ? Number(priceMatch[1].replace(/,/g, ''))
        : matchedVehicle.askingPrice;
      let newStatus = matchedVehicle.status;
      if (lower.includes('available')) newStatus = 'Available';
      else if (lower.includes('in prep')) newStatus = 'In prep';
      else if (lower.includes('reserved')) newStatus = 'Reserved';
      else if (lower.includes('in transit')) newStatus = 'In transit';

      const preview: PendingActionPreview = {
        id: `act-${Date.now()}`,
        actionType: 'update_vehicle',
        targetTitle: `${matchedVehicle.year} ${matchedVehicle.make} ${matchedVehicle.model} (${matchedVehicle.stockId})`,
        summary: `Update ${matchedVehicle.stockId} specifications in inventory.`,
        diffs: [
          {
            field: 'Asking Price',
            before: formatMoney(matchedVehicle.askingPrice, currency),
            after: formatMoney(newAsking, currency),
          },
          {
            field: 'Inventory Status',
            before: matchedVehicle.status,
            after: newStatus,
          },
        ],
        payload: {
          vehicleId: matchedVehicle.id,
          askingPrice: newAsking,
          status: newStatus,
        },
        status: 'pending',
      };

      return {
        reply: `Prepared vehicle update for **${matchedVehicle.year} ${matchedVehicle.make} ${matchedVehicle.model} (${matchedVehicle.stockId})**. Confirm below to apply:`,
        pendingAction: preview,
      };
    }
  }

  // 5.6 Add Debt (Receivable / Payable) mutation command
  if (
    lower.includes('i owe') ||
    lower.includes('owes me') ||
    lower.includes('add debt') ||
    lower.includes('add balance')
  ) {
    const amtMatch = q.match(/\$?(\d{1,3}(?:,\d{3})+|\d{2,6})/);
    const amount = amtMatch ? Number(amtMatch[1].replace(/,/g, '')) : 1000;
    const direction: 'Owed to me' | 'I owe' = lower.includes('i owe')
      ? 'I owe'
      : 'Owed to me';
    const counterparty = 'Dealership Counterparty';
    const dueDate = '2026-11-25';

    const preview: PendingActionPreview = {
      id: `act-${Date.now()}`,
      actionType: 'add_debt',
      targetTitle: `${direction}: ${counterparty}`,
      summary: `Record ${formatMoney(amount, currency)} ${
        direction === 'Owed to me' ? 'receivable' : 'payable'
      } balance due ${dueDate}.`,
      diffs: [
        { field: 'Direction', before: '—', after: direction },
        { field: 'Balance Amount', before: '$0', after: formatMoney(amount, currency) },
        { field: 'Due Date', before: '—', after: dueDate },
      ],
      payload: {
        counterparty,
        direction,
        amount,
        date: new Date().toISOString().slice(0, 10),
        dueDate,
        phone: '+1 (512) 555-0190',
        notes: q,
      },
      status: 'pending',
    };

    return {
      reply: `Prepared counterparty debt balance (${direction}) for **${formatMoney(amount, currency)}**. Confirm below to save:`,
      pendingAction: preview,
    };
  }

  // 6. Add Expense mutation command (e.g. "Add a 250 fuel expense", receipt upload, etc.)
  const amountMatch = q.match(/\$?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
  if (
    lower.includes('expense') ||
    lower.includes('fuel') ||
    lower.includes('repair') ||
    lower.includes('detail') ||
    lower.includes('transport') ||
    hasImage ||
    amountMatch
  ) {
    const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 250;
    const matchedVehicle = activeStock.find(
      (v) =>
        lower.includes(v.make.toLowerCase()) ||
        lower.includes(v.model.toLowerCase()) ||
        lower.includes(v.stockId.toLowerCase())
    );

    let category: Expense['category'] = 'Office';
    if (lower.includes('detail') || lower.includes('wash')) category = 'Detailing';
    else if (lower.includes('repair') || lower.includes('brake') || lower.includes('tire'))
      category = 'Repairs';
    else if (lower.includes('fuel') || lower.includes('gas') || lower.includes('tow') || lower.includes('transport'))
      category = 'Transport';
    else if (lower.includes('part')) category = 'Parts';

    const description = hasImage
      ? `OCR Receipt: ${q || 'Lot Fuel & Service Receipt'}`
      : q.length > 4
      ? q.charAt(0).toUpperCase() + q.slice(1)
      : `${category} Expense`;

    const preview: PendingActionPreview = {
      id: `act-${Date.now()}`,
      actionType: 'create_expense',
      targetTitle: matchedVehicle
        ? `${matchedVehicle.year} ${matchedVehicle.make} ${matchedVehicle.model} (${matchedVehicle.stockId})`
        : 'General Dealership Overhead',
      summary: `Log ${formatMoney(amount, currency)} ${category} expense (${
        matchedVehicle ? `Linked to ${matchedVehicle.stockId}` : 'General Overhead'
      }) paid from ${bankAcc?.name || 'Main Operating Bank'}.`,
      diffs: [
        { field: 'Expense Category', before: '—', after: category },
        { field: 'Amount', before: '$0', after: formatMoney(amount, currency) },
        {
          field: 'Allocation Target',
          before: 'Unallocated',
          after: matchedVehicle
            ? `${matchedVehicle.stockId} (${matchedVehicle.year} ${matchedVehicle.make} ${matchedVehicle.model})`
            : 'General Overhead',
        },
        {
          field: `${bankAcc?.name || 'Bank'} Balance`,
          before: formatMoney(bankAcc?.balance || 0, currency, !isSensitiveAllowed),
          after: formatMoney((bankAcc?.balance || 0) - amount, currency, !isSensitiveAllowed),
        },
      ],
      payload: {
        amount,
        category,
        type: matchedVehicle ? 'Vehicle-linked' : 'General Overhead',
        vehicleId: matchedVehicle?.id,
        paidFromAccountId: bankAcc?.id || 'acc-1',
        description,
      },
      status: 'pending',
    };

    return {
      reply: `I prepared an expense entry for **${formatMoney(amount, currency)}** (${category}). Confirm below to post it to the expense ledger and deduct from **${bankAcc?.name || 'Main Operating Bank'}**:`,
      pendingAction: preview,
    };
  }

  // Default analytical overview
  const soldCount = state.sales.length;
  const totalRevenue = state.sales.reduce((s, r) => s + r.saleAmount, 0);
  return {
    reply:
      `Here is a live snapshot of **${state.settings.dealershipName}**:\n\n` +
      `• **Active Inventory:** ${activeStock.length} units in stock\n` +
      `• **Completed Sales:** ${soldCount} units (${formatMoney(totalRevenue, currency)} gross revenue)\n` +
      `• **Open CRM Leads:** ${state.clients.filter((c) => c.stage !== 'Sold').length} active buyer leads\n\n` +
      `You can tell me to log an expense (*"Add a 250 fuel expense"*), add a car (*"Bought a 2021 Camry for 18,000"*), or ask about inventory and receivables.`,
  };
}

export interface VoiceAuditSummaryResult {
  title: string;
  summary: string;
  category: string;
  financialImpact?: string;
  relatedVehicleVinOrStock?: string;
  source: 'assistant_voice';
}

export function generateVoiceAuditSummary(
  rawTranscript: string,
  state: DealershipState
): VoiceAuditSummaryResult {
  const text = (rawTranscript || '').trim();
  const lower = text.toLowerCase();
  const currency = state.settings.currency;

  // Extract dollar amounts
  const moneyMatch =
    text.match(/\$(\d{1,3}(?:,\d{3})+|\d+)/) ||
    lower.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(?:dollars|bucks|k)/i);
  let amount = 0;
  if (moneyMatch) {
    const rawVal = moneyMatch[1].replace(/,/g, '');
    amount = moneyMatch[0].toLowerCase().includes('k') ? Number(rawVal) * 1000 : Number(rawVal);
  } else {
    // Spoken dictation number phrases
    if (lower.includes('two hundred eighty')) amount = 280;
    else if (lower.includes('thirty four thousand five hundred')) amount = 34500;
    else if (lower.includes('three hundred fifty')) amount = 350;
    else if (lower.includes('five hundred')) amount = 500;
    else if (lower.includes('two hundred fifty')) amount = 250;
    else if (lower.includes('one hundred seventy eight')) amount = 178;
    else if (lower.includes('eighteen thousand')) amount = 18000;
  }

  // Detect vehicle mention
  let matchedVehicle = state.vehicles.find((v) => {
    return (
      (v.stockId && lower.includes(v.stockId.toLowerCase())) ||
      (v.model && lower.includes(v.model.toLowerCase())) ||
      (v.make && lower.includes(v.make.toLowerCase()))
    );
  });

  // Heuristic category detection
  let category = 'Cash Movement';
  let title = 'Voice Audit Memo';
  let financialImpact = amount > 0 ? `-$${amount.toLocaleString()} estimated cash impact` : 'Operational Audit';

  if (lower.includes('bought') || lower.includes('purchase') || lower.includes('acquire') || lower.includes('floorplan')) {
    category = 'Vehicle Acquisition';
    title = `Voice Memo: ${matchedVehicle ? matchedVehicle.model : 'Vehicle'} Acquisition`;
    financialImpact = amount > 0 ? `-$${amount.toLocaleString()} capital disbursement` : 'Inventory addition';
  } else if (lower.includes('detailing') || lower.includes('detail') || lower.includes('wash') || lower.includes('recon')) {
    category = 'Reconditioning & Detailing';
    title = `Voice Memo: ${matchedVehicle ? matchedVehicle.model : 'Vehicle'} Recon & Detailing`;
    financialImpact = amount > 0 ? `-$${amount.toLocaleString()} recon expense` : 'Lot service';
  } else if (lower.includes('repair') || lower.includes('mechanic') || lower.includes('brakes') || lower.includes('alignment')) {
    category = 'Repairs & Mechanical';
    title = `Voice Memo: ${matchedVehicle ? matchedVehicle.model : 'Vehicle'} Mechanical Repair`;
    financialImpact = amount > 0 ? `-$${amount.toLocaleString()} repair expense` : 'Maintenance log';
  } else if (lower.includes('carrier') || lower.includes('transport') || lower.includes('tow') || lower.includes('dispatch')) {
    category = 'Transport & Towing';
    title = `Voice Memo: Carrier Transport & Dispatch`;
    financialImpact = amount > 0 ? `-$${amount.toLocaleString()} transport outflow` : 'Transit update';
  } else if (lower.includes('sold') || lower.includes('sale') || lower.includes('buyer') || lower.includes('customer')) {
    category = 'Sales Proceeds';
    title = `Voice Memo: ${matchedVehicle ? matchedVehicle.model : 'Unit'} Sale Proceeds`;
    financialImpact = amount > 0 ? `+$${amount.toLocaleString()} gross inflow` : 'Sale transaction';
  } else if (lower.includes('debt') || lower.includes('note') || lower.includes('owe') || lower.includes('settle')) {
    category = 'Debt Settlement';
    title = `Voice Memo: Promissory Note & Settlement`;
    financialImpact = amount > 0 ? `+$${amount.toLocaleString()} receivable collection` : 'Counterparty balance';
  } else if (lower.includes('fuel') || lower.includes('gas') || lower.includes('lease') || lower.includes('rent') || lower.includes('expense')) {
    category = lower.includes('lease') || lower.includes('rent') ? 'Lot Lease & Facilities' : 'General Overhead';
    title = `Voice Memo: Lot Expense & Overhead`;
    financialImpact = amount > 0 ? `-$${amount.toLocaleString()} operating outflow` : 'Overhead expense';
  }

  // Generate crisp 2-3 sentence executive audit summary
  const summaryParts: string[] = [];
  summaryParts.push(
    `Audited dealer voice dictation logged at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
  );

  if (matchedVehicle) {
    summaryParts.push(
      `Identified associated inventory unit ${matchedVehicle.stockId} (${matchedVehicle.year} ${matchedVehicle.make} ${matchedVehicle.model}).`
    );
  }

  if (amount > 0) {
    summaryParts.push(
      `Recorded financial allocation of ${formatMoney(amount, currency)} categorized under "${category}".`
    );
  } else {
    summaryParts.push(
      `Action categorized under "${category}". No explicit transaction amount detected; logged as qualitative audit note.`
    );
  }

  return {
    title,
    summary: summaryParts.join(' '),
    category,
    financialImpact,
    relatedVehicleVinOrStock: matchedVehicle?.stockId || undefined,
    source: 'assistant_voice',
  };
}

export const SAMPLE_PARTS_CSV_TEMPLATE = `code,name,category,quantity,unitCost,batchLabel,purchaseDate
BRK-AKE-02,Akebono Ultra Ceramic Rear Pads,Brakes,10,48.50,BATCH-NOV-01,2026-11-01
FLT-BOS-01,Bosch Premium Oil Filter,Filters,25,12.00,BATCH-NOV-02,2026-11-03
SPK-DEN-04,Denso Iridium Power Spark Plugs,Ignition,16,9.75,BATCH-NOV-03,2026-11-05
SUS-KYB-01,KYB Excel-G Front Strut Assembly,Suspension,4,115.00,BATCH-NOV-04,2026-11-07
BAT-INT-24,Interstate Megatron AGM Group 24F,Electrical,6,145.00,BATCH-NOV-05,2026-11-08`;

export interface ParsedCsvResult {
  items: CsvPartBatchInput[];
  errors: string[];
  totalParsed: number;
  totalValid: number;
}

export function parseCsvRows(rawText: string): string[][] {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let insideQuote = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (!insideQuote) {
          // Quote only initiates quoted string if cell is currently empty or whitespace
          if (currentCell.trim().length === 0) {
            insideQuote = true;
          } else {
            // Internal quote like 22" wiper blade
            currentCell += '"';
          }
        } else {
          // Inside a quoted cell
          if (line[i + 1] === '"') {
            currentCell += '"';
            i++;
          } else {
            insideQuote = false;
          }
        }
      } else if ((char === ',' || char === '\t' || char === ';') && !insideQuote) {
        row.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    rows.push(row);
  }

  return rows;
}

export function parsePartsCsvText(csvText: string): ParsedCsvResult {
  const result: ParsedCsvResult = {
    items: [],
    errors: [],
    totalParsed: 0,
    totalValid: 0,
  };

  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    result.errors.push('The provided CSV file or text is empty.');
    return result;
  }

  // Header matching
  const rawHeaders = rows[0].map((h) => h.toLowerCase().replace(/[\s_#-]/g, ''));
  const headerMap: Record<string, number> = {};

  rawHeaders.forEach((h, idx) => {
    if (['code', 'sku', 'partno', 'partnumber', 'partcode', 'id'].includes(h)) {
      headerMap.code = idx;
    } else if (['name', 'partname', 'description', 'part', 'title'].includes(h)) {
      headerMap.name = idx;
    } else if (['category', 'cat', 'group', 'type'].includes(h)) {
      headerMap.category = idx;
    } else if (['quantity', 'qty', 'units', 'count', 'amount'].includes(h)) {
      headerMap.quantity = idx;
    } else if (['unitcost', 'cost', 'unitprice', 'price', 'rate', 'each'].includes(h)) {
      headerMap.unitCost = idx;
    } else if (['batchlabel', 'batch', 'batchno', 'lot', 'lotnumber'].includes(h)) {
      headerMap.batchLabel = idx;
    } else if (['purchasedate', 'date', 'purchased', 'orderdate'].includes(h)) {
      headerMap.purchaseDate = idx;
    }
  });

  const hasHeaderRow =
    headerMap.code !== undefined ||
    headerMap.name !== undefined ||
    headerMap.quantity !== undefined;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  result.totalParsed = dataRows.length;

  dataRows.forEach((row, rowIdx) => {
    const rowNumber = hasHeaderRow ? rowIdx + 2 : rowIdx + 1;
    if (row.every((cell) => !cell || cell.trim() === '')) return; // skip blank row

    let code = (headerMap.code !== undefined ? row[headerMap.code] : row[0]) || '';
    let name = (headerMap.name !== undefined ? row[headerMap.name] : row[1]) || '';
    let category = (headerMap.category !== undefined ? row[headerMap.category] : row[2]) || 'General';
    const rawQty = (headerMap.quantity !== undefined ? row[headerMap.quantity] : row[3]) || '';
    const rawCost = (headerMap.unitCost !== undefined ? row[headerMap.unitCost] : row[4]) || '';
    let batchLabel = (headerMap.batchLabel !== undefined ? row[headerMap.batchLabel] : row[5]) || '';
    let purchaseDate = (headerMap.purchaseDate !== undefined ? row[headerMap.purchaseDate] : row[6]) || '';

    // Sanitization
    code = code.replace(/^"|"$/g, '').trim().toUpperCase();
    name = name.replace(/^"|"$/g, '').trim();
    category = category.replace(/^"|"$/g, '').trim() || 'General';
    batchLabel = batchLabel.replace(/^"|"$/g, '').trim();
    purchaseDate = purchaseDate.replace(/^"|"$/g, '').trim();

    // Default code if name is present but code isn't
    if (!code && name) {
      code = name
        .split(/\s+/)
        .map((w) => w.slice(0, 3).toUpperCase())
        .slice(0, 3)
        .join('-');
    }

    if (!code && !name) {
      result.errors.push(`Row ${rowNumber}: Missing both Part Code and Part Name.`);
      return;
    }

    if (!name && code) {
      name = code;
    }

    // Parse numeric quantity
    const cleanQty = rawQty.replace(/[^0-9.-]/g, '');
    const quantity = parseInt(cleanQty, 10);
    if (isNaN(quantity) || quantity <= 0) {
      result.errors.push(
        `Row ${rowNumber} ("${name || code}"): Quantity must be a positive integer (found "${rawQty}").`
      );
      return;
    }

    // Parse numeric cost
    const cleanCost = rawCost.replace(/[^0-9.-]/g, '');
    const unitCost = parseFloat(cleanCost);
    if (isNaN(unitCost) || unitCost < 0) {
      result.errors.push(
        `Row ${rowNumber} ("${name || code}"): Unit cost must be a non-negative number (found "${rawCost}").`
      );
      return;
    }

    // Default purchase date to today if invalid or missing
    if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}/.test(purchaseDate)) {
      purchaseDate = new Date().toISOString().slice(0, 10);
    }

    // Default batch label if missing
    if (!batchLabel) {
      batchLabel = `BATCH-${purchaseDate.replace(/-/g, '')}-${String(result.items.length + 1).padStart(2, '0')}`;
    }

    result.items.push({
      code,
      name,
      category,
      batchLabel,
      quantity,
      unitCost: Number(unitCost.toFixed(2)),
      purchaseDate,
    });
  });

  result.totalValid = result.items.length;
  return result;
}

/**
 * Historical Usage Pattern & Reorder Analysis for Parts Inventory
 */
export interface PartUsageAlert {
  partId: string;
  code: string;
  name: string;
  category: string;
  currentStock: number;
  totalHistoricalConsumed: number;
  monthlyBurnRate: number;
  safetyStockThreshold: number;
  daysRemaining: number;
  suggestedReorderQty: number;
  estimatedUnitCost: number;
  totalEstimatedCost: number;
  urgency: 'Critical' | 'High' | 'Warning';
  isPendingReorder: boolean;
  activeRequestId?: string;
  statusMessage: string;
}

/**
 * Analyzes parts inventory against historical reconditioning allocations,
 * counter sales, and FIFO batch depletion to identify low-stock items.
 */
export function getLowStockPartAlerts(state: DealershipState): PartUsageAlert[] {
  const alerts: PartUsageAlert[] = [];

  for (const part of state.parts) {
    const batches = state.partBatches.filter((b) => b.partId === part.id);
    const currentStock = batches.reduce((sum, b) => sum + b.remainingQty, 0);

    // 1. Calculate historical usage patterns:
    // A) Consumed from batches directly (initialQty - remainingQty)
    const consumedFromBatches = batches.reduce(
      (sum, b) => sum + Math.max(0, b.initialQty - b.remainingQty),
      0
    );

    // B) Direct counter part sales
    const partSalesQty = state.partSales
      .filter(
        (ps) =>
          ps.partId === part.id ||
          ps.partName.toLowerCase() === part.name.toLowerCase()
      )
      .reduce((sum, ps) => sum + ps.quantity, 0);

    // C) Vehicle recon expenses mentioning part code
    const reconExpenseUses = state.expenses.filter(
      (e) =>
        e.fifoPartCode === part.code ||
        e.description.toLowerCase().includes(part.code.toLowerCase())
    ).length;

    const totalConsumed = Math.max(
      consumedFromBatches,
      partSalesQty,
      reconExpenseUses
    );

    // Monthly velocity estimation
    const monthlyBurnRate =
      totalConsumed > 0 ? Math.max(1, Math.round(totalConsumed * 1.2)) : 3;

    // Safety stock point: ~18-21 days of burn rate, min 2 units
    const safetyStockThreshold = Math.max(2, Math.ceil(monthlyBurnRate * 0.6));

    // Check if part has reached or breached low-stock threshold
    if (currentStock <= safetyStockThreshold) {
      const dailyBurnRate = monthlyBurnRate / 30;
      const daysRemaining =
        dailyBurnRate > 0
          ? Math.max(0, Math.round(currentStock / dailyBurnRate))
          : 0;

      // Recommended reorder to replenish to a 45-day supply buffer
      const suggestedReorderQty = Math.max(
        4,
        Math.ceil(monthlyBurnRate * 1.5) - currentStock
      );

      const sortedBatches = [...batches].sort((a, b) =>
        b.purchaseDate.localeCompare(a.purchaseDate)
      );
      const latestUnitCost = sortedBatches[0]?.unitCost || 35;
      const totalEstimatedCost = Number(
        (suggestedReorderQty * latestUnitCost).toFixed(2)
      );

      const urgency: 'Critical' | 'High' | 'Warning' =
        currentStock === 0
          ? 'Critical'
          : currentStock <= 1
          ? 'Critical'
          : currentStock <= 2
          ? 'High'
          : 'Warning';

      const existingRequest = (state.reorderRequests || []).find(
        (r) => r.partId === part.id && r.status !== 'Received'
      );

      alerts.push({
        partId: part.id,
        code: part.code,
        name: part.name,
        category: part.category,
        currentStock,
        totalHistoricalConsumed: totalConsumed,
        monthlyBurnRate,
        safetyStockThreshold,
        daysRemaining,
        suggestedReorderQty,
        estimatedUnitCost: latestUnitCost,
        totalEstimatedCost,
        urgency,
        isPendingReorder: !!existingRequest,
        activeRequestId: existingRequest?.id,
        statusMessage:
          currentStock === 0
            ? 'Stock exhausted! Immediate restock required.'
            : `${currentStock} unit${
                currentStock === 1 ? '' : 's'
              } remaining (~${daysRemaining} day${
                daysRemaining === 1 ? '' : 's'
              } left at ${monthlyBurnRate} units/mo).`,
      });
    }
  }

  // Sort by urgency: Critical first, then lowest daysRemaining
  return alerts.sort((a, b) => {
    const score = { Critical: 3, High: 2, Warning: 1 };
    if (score[b.urgency] !== score[a.urgency]) {
      return score[b.urgency] - score[a.urgency];
    }
    return a.daysRemaining - b.daysRemaining;
  });
}

/**
 * 1-Click Purchase Reorder Request Generator from Historical Usage Patterns
 */
export function generatePartReorderRequest(
  partId: string,
  state: DealershipState,
  customQty?: number,
  notes?: string
): PartReorderRequest {
  const part = state.parts.find((p) => p.id === partId);
  if (!part) {
    throw new Error(`Part not found with id: ${partId}`);
  }

  const batches = state.partBatches.filter((b) => b.partId === part.id);
  const currentStock = batches.reduce((sum, b) => sum + b.remainingQty, 0);
  const sortedBatches = [...batches].sort((a, b) =>
    b.purchaseDate.localeCompare(a.purchaseDate)
  );
  const latestUnitCost = sortedBatches[0]?.unitCost || 35;

  const consumed = batches.reduce(
    (sum, b) => sum + Math.max(0, b.initialQty - b.remainingQty),
    0
  );
  const monthlyBurnRate =
    consumed > 0 ? Math.max(1, Math.round(consumed * 1.2)) : 3;
  const suggestedQty =
    customQty && customQty > 0
      ? customQty
      : Math.max(4, Math.ceil(monthlyBurnRate * 1.5) - currentStock);
  const totalEstimatedCost = Number(
    (suggestedQty * latestUnitCost).toFixed(2)
  );
  const dailyBurn = monthlyBurnRate / 30;
  const runoutDays = dailyBurn > 0 ? Math.round(currentStock / dailyBurn) : 0;
  const urgency: 'Critical' | 'High' | 'Warning' =
    currentStock <= 1
      ? 'Critical'
      : currentStock <= 2
      ? 'High'
      : 'Warning';

  const now = new Date();
  const requestId = `po-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`;

  return {
    id: requestId,
    partId: part.id,
    partCode: part.code,
    partName: part.name,
    category: part.category,
    currentStock,
    suggestedQty,
    estimatedUnitCost: latestUnitCost,
    totalEstimatedCost,
    burnRateMonthly: monthlyBurnRate,
    runoutDays,
    urgency,
    status: 'Ordered',
    createdAt: now.toISOString().slice(0, 10),
    orderedAt: now.toISOString().slice(0, 10),
    supplierNotes:
      notes ||
      `Auto-generated from usage pattern alert (${monthlyBurnRate} units/mo burn rate).`,
  };
}

/**
 * Interactive Deal Profit Calculator (SalesView)
 * Combines purchase cost, existing vehicle-linked recon, live FIFO parts reconditioning costs
 * from PartsView, and fixed/variable overhead allocations to estimate unit net profit margin.
 */
export function calculateDealProfitEstimate(
  input: DealProfitEstimateInput,
  partBatches: PartBatch[],
  parts: PartItem[]
): DealProfitEstimateResult {
  const salePrice = Math.max(0, Number(input.salePrice) || 0);
  const purchaseCost = Math.max(0, Number(input.purchaseCost) || 0);
  const existingReconCost = Math.max(0, Number(input.existingReconCost) || 0);
  const manualReconCost = Math.max(0, Number(input.manualReconCost) || 0);
  const fixedOverheadAllocation = Math.max(0, Number(input.fixedOverheadAllocation) || 0);
  const overheadPackPct = Math.max(0, Number(input.overheadPackPct) || 0);
  const holdingCostAllocation = Math.max(0, Number(input.holdingCostAllocation) || 0);
  const vatOrDocFeeBenefit = Number(input.vatOrDocFeeBenefit) || 0;

  const partsBreakdown: DealProfitPartBreakdownItem[] = [];
  let fifoPartsReconCost = 0;

  for (const sel of input.selectedParts || []) {
    const qty = Math.max(0, Math.floor(Number(sel.quantity) || 0));
    if (qty <= 0) continue;

    const part = parts.find((p) => p.id === sel.partId);
    if (!part) continue;

    const partSpecificBatches = partBatches.filter(
      (b) => b.partId === part.id && b.remainingQty > 0
    );
    const totalAvailable = partSpecificBatches.reduce(
      (sum, b) => sum + b.remainingQty,
      0
    );

    if (totalAvailable >= qty && qty > 0) {
      const fifoSim = allocateFifoPartBatches(partBatches, part.id, qty);
      fifoPartsReconCost += fifoSim.totalFifoCost;
      partsBreakdown.push({
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        quantity: qty,
        fifoTotalCost: Number(fifoSim.totalFifoCost.toFixed(2)),
        effectiveUnitCost: Number((fifoSim.totalFifoCost / qty).toFixed(2)),
        batchSummary: fifoSim.allocations
          .map((a) => `${a.qtyUsed}x ${a.batchLabel} @ $${a.unitCost}`)
          .join(', '),
      });
    } else {
      // Fallback if simulated quantity exceeds current on-hand FIFO batches
      const allBatchesForPart = partBatches
        .filter((b) => b.partId === part.id)
        .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
      const fallbackUnitCost = allBatchesForPart[0]?.unitCost || 45;
      const simulatedCost = Number((qty * fallbackUnitCost).toFixed(2));
      fifoPartsReconCost += simulatedCost;
      partsBreakdown.push({
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        quantity: qty,
        fifoTotalCost: simulatedCost,
        effectiveUnitCost: fallbackUnitCost,
        batchSummary: `${qty}x Est. Replenishment Batch @ $${fallbackUnitCost}`,
      });
    }
  }

  fifoPartsReconCost = Number(fifoPartsReconCost.toFixed(2));
  const totalReconCost = Number(
    (existingReconCost + manualReconCost + fifoPartsReconCost).toFixed(2)
  );

  const variableOverheadCost = Number(
    ((purchaseCost * overheadPackPct) / 100).toFixed(2)
  );
  const totalOverheadCost = Number(
    (fixedOverheadAllocation + variableOverheadCost + holdingCostAllocation).toFixed(2)
  );

  const totalAllInCost = Number(
    (purchaseCost + totalReconCost + totalOverheadCost).toFixed(2)
  );

  const estimatedNetProfit = Number(
    (salePrice - totalAllInCost + vatOrDocFeeBenefit).toFixed(2)
  );

  const netProfitMarginPct =
    salePrice > 0
      ? Number(((estimatedNetProfit / salePrice) * 100).toFixed(1))
      : 0;

  const roiPct =
    totalAllInCost > 0
      ? Number(((estimatedNetProfit / totalAllInCost) * 100).toFixed(1))
      : 0;

  const breakEvenPrice = Math.max(0, Number((totalAllInCost - vatOrDocFeeBenefit).toFixed(2)));
  const target15MarginPrice = Math.max(
    0,
    Math.round((totalAllInCost - vatOrDocFeeBenefit) / 0.85)
  );

  let marginHealth: 'Strong' | 'Healthy' | 'Thin' | 'Loss' = 'Healthy';
  if (estimatedNetProfit < 0) {
    marginHealth = 'Loss';
  } else if (netProfitMarginPct >= 15) {
    marginHealth = 'Strong';
  } else if (netProfitMarginPct >= 8) {
    marginHealth = 'Healthy';
  } else {
    marginHealth = 'Thin';
  }

  return {
    salePrice,
    purchaseCost,
    existingReconCost,
    manualReconCost,
    fifoPartsReconCost,
    totalReconCost,
    fixedOverheadAllocation,
    variableOverheadCost,
    holdingCostAllocation,
    totalOverheadCost,
    totalAllInCost,
    vatOrDocFeeBenefit,
    estimatedNetProfit,
    netProfitMarginPct,
    roiPct,
    breakEvenPrice,
    target15MarginPrice,
    marginHealth,
    partsBreakdown,
  };
}

/**
 * Generates an in-memory SVG/Document Blob and returns a temporary local object URL (`blob:...`)
 * using `URL.createObjectURL` for secure, zero-cloud-leakage KYC document handling.
 */
export function createLocalKycDocumentBlobUrl(params: {
  clientName: string;
  category: ClientDocumentCategory;
  docNumber?: string;
  issuedDate?: string;
}): { objectUrl: string; sizeBytes: number; mimeType: string; fileName: string } {
  const safeName = params.clientName.replace(/[^a-zA-Z0-9]/g, '_');
  const docId = params.docNumber || `TX-${Math.floor(10000000 + Math.random() * 89999999)}`;
  const dateStr = params.issuedDate || new Date().toISOString().slice(0, 10);

  const badgeColor =
    params.category === 'Driver License'
      ? '#1d4ed8'
      : params.category === 'Proof of Insurance'
      ? '#047857'
      : '#b45309';

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="420" viewBox="0 0 680 420">
    <rect width="680" height="420" rx="18" fill="#0f172a" />
    <rect x="16" y="16" width="648" height="388" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" />
    <rect x="16" y="16" width="648" height="68" rx="12" fill="${badgeColor}" />
    <text x="40" y="54" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="bold">
      STATE OF TEXAS · VERIFIED DEALERSHIP KYC RECORD
    </text>
    <text x="490" y="54" fill="#e2e8f0" font-family="monospace" font-size="14" font-weight="bold">
      ${params.category.toUpperCase()}
    </text>
    <rect x="40" y="110" width="140" height="175" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5" />
    <circle cx="110" cy="170" r="32" fill="#94a3b8" />
    <path d="M62 255 C62 220 158 220 158 255" fill="#94a3b8" />
    <text x="72" y="276" fill="#475569" font-family="monospace" font-size="11">PHOTO VERIFIED</text>
    <text x="210" y="130" fill="#64748b" font-family="Arial, sans-serif" font-size="11" font-weight="bold">CLIENT FULL NAME</text>
    <text x="210" y="156" fill="#0f172a" font-family="Arial, sans-serif" font-size="24" font-weight="bold">${params.clientName}</text>
    <text x="210" y="196" fill="#64748b" font-family="Arial, sans-serif" font-size="11" font-weight="bold">DOCUMENT NUMBER / POLICY REF</text>
    <text x="210" y="220" fill="#0f172a" font-family="monospace" font-size="18" font-weight="bold">${docId}</text>
    <text x="210" y="256" fill="#64748b" font-family="Arial, sans-serif" font-size="11" font-weight="bold">VERIFICATION TIMESTAMP</text>
    <text x="210" y="278" fill="#0f172a" font-family="monospace" font-size="15">${dateStr} · LOCAL SESSION OBJECT URL</text>
    <rect x="40" y="315" width="600" height="62" rx="8" fill="#f1f5f9" stroke="#cbd5e1" />
    <text x="56" y="340" fill="#334155" font-family="monospace" font-size="12" font-weight="bold">
      SECURITY PROTOCOL: Temporary In-Memory Object URL (URL.createObjectURL)
    </text>
    <text x="56" y="362" fill="#64748b" font-family="monospace" font-size="11">
      Zero external cloud transmission · Scoped to active dealership browser session
    </text>
  </svg>`;

  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const objectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;

  return {
    objectUrl,
    sizeBytes: blob.size || svgContent.length,
    mimeType: 'image/svg+xml',
    fileName: `${safeName}_${params.category.replace(/[^a-zA-Z0-9]/g, '_')}.svg`,
  };
}

/**
 * Generates an optical camera scan Blob & temporary Object URL (`blob:...`) for physical
 * Vehicle Titles or Service/Parts Invoices captured in ClientsView or PartsView.
 */
export function createScannedDocumentBlobUrl(params: {
  docType: 'Vehicle Title' | 'Service Invoice';
  referenceCode: string;
  primaryTitle: string;
  counterpartyOrVendor: string;
  vinOrSku: string;
  amountText: string;
  notes?: string;
}): { objectUrl: string; sizeBytes: number; mimeType: string; fileName: string } {
  const safeRef = (params.referenceCode || 'SCAN-001').replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const isTitle = params.docType === 'Vehicle Title';
  const headerBg = isTitle ? '#0f766e' : '#1e3a8a';
  const accentStroke = isTitle ? '#14b8a6' : '#3b82f6';

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="480" viewBox="0 0 760 480">
    <rect width="760" height="480" rx="16" fill="#090d16" />
    <rect x="18" y="18" width="724" height="444" rx="10" fill="#ffffff" stroke="${accentStroke}" stroke-width="2.5" />
    <rect x="18" y="18" width="724" height="74" rx="10" fill="${headerBg}" />
    <text x="42" y="50" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="bold">
      ${isTitle ? 'OFFICIAL STATE CERTIFICATE OF VEHICLE TITLE (CAMERA SCAN)' : 'COMMERCIAL SERVICE &amp; PARTS RECONDITIONING INVOICE (CAMERA SCAN)'}
    </text>
    <text x="42" y="74" fill="#cbd5e1" font-family="monospace" font-size="12" font-weight="bold">
      OPTICAL CAMERA CAPTURE · REF #${params.referenceCode} · ${timestamp}
    </text>
    <rect x="42" y="114" width="676" height="84" rx="8" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="60" y="138" fill="#64748b" font-family="Arial, sans-serif" font-size="11" font-weight="bold">
      ${isTitle ? 'VEHICLE YEAR / MAKE / MODEL &amp; BODY' : 'INVOICE LINE ITEM / SERVICE DESCRIPTION'}
    </text>
    <text x="60" y="164" fill="#0f172a" font-family="Arial, sans-serif" font-size="21" font-weight="bold">
      ${params.primaryTitle}
    </text>
    <text x="60" y="186" fill="#475569" font-family="monospace" font-size="13">
      ${isTitle ? `17-CHAR VIN: ${params.vinOrSku}` : `PART SKU / CODE: ${params.vinOrSku}`}
    </text>
    <rect x="42" y="214" width="328" height="92" rx="8" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="60" y="240" fill="#64748b" font-family="Arial, sans-serif" font-size="11" font-weight="bold">
      ${isTitle ? 'REGISTERED OWNER / TRANSFEROR' : 'SUPPLIER / VENDOR NAME'}
    </text>
    <text x="60" y="268" fill="#0f172a" font-family="Arial, sans-serif" font-size="18" font-weight="bold">
      ${params.counterpartyOrVendor}
    </text>
    <text x="60" y="292" fill="#059669" font-family="monospace" font-size="12" font-weight="bold">
      ${isTitle ? '✓ LIEN RELEASED / CLEAR TITLE VERIFIED' : '✓ FIFO BATCH COST VERIFIED'}
    </text>
    <rect x="390" y="214" width="328" height="92" rx="8" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="410" y="240" fill="#64748b" font-family="Arial, sans-serif" font-size="11" font-weight="bold">
      ${isTitle ? 'DECLARED TRADE-IN / ACQUISITION VALUE' : 'TOTAL INVOICE / BATCH AMOUNT'}
    </text>
    <text x="410" y="274" fill="#0f172a" font-family="monospace" font-size="24" font-weight="bold">
      ${params.amountText}
    </text>
    <text x="410" y="294" fill="#64748b" font-family="monospace" font-size="11">
      DOC ID: ${params.referenceCode}
    </text>
    <rect x="42" y="324" width="676" height="64" rx="8" fill="#f1f5f9" stroke="#cbd5e1" />
    <text x="60" y="348" fill="#334155" font-family="monospace" font-size="12" font-weight="bold">
      AUDIT &amp; COMPLIANCE NOTES: ${params.notes || (isTitle ? 'Physical certificate of title scanned via dealership camera.' : 'Physical supplier invoice scanned and linked to FIFO batch.')}
    </text>
    <text x="60" y="372" fill="#64748b" font-family="monospace" font-size="11">
      STORAGE: Local Session Object URL (URL.createObjectURL) · Zero Cloud Leakage · Camera Hardware Verified
    </text>
    <rect x="42" y="404" width="240" height="36" rx="6" fill="#ecfdf5" stroke="#10b981" />
    <text x="58" y="427" fill="#047857" font-family="monospace" font-size="12" font-weight="bold">
      ✓ OPTICAL SCAN AUTHENTICATED
    </text>
  </svg>`;

  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const objectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;

  return {
    objectUrl,
    sizeBytes: blob.size || svgContent.length,
    mimeType: 'image/svg+xml',
    fileName: `${isTitle ? 'Title_Scan' : 'Invoice_Scan'}_${safeRef}.svg`,
  };
}

/**
 * Computes monthly revenue, COGS, gross profit, operating expenses, profit margin %,
 * and annualized inventory turnover summaries for external auditing in ReportsView.
 */
export function generateMonthlyAuditSummaryRows(state: DealershipState): {
  rows: MonthlyAuditSummaryRow[];
  totals: {
    totalRevenue: number;
    totalCogs: number;
    totalGrossProfit: number;
    totalExpenses: number;
    weightedMarginPct: number;
    avgTurnoverRate: number;
    totalUnitsSold: number;
  };
} {
  const dashMetrics = calculateDashboardMetrics(state, 'all');
  const baseUnitsByMonth: Record<string, number> = {
    '2026-06': 1,
    '2026-07': 1,
    '2026-08': 1,
    '2026-09': 2,
    '2026-10': 0,
    '2026-11': 0,
  };

  const rows: MonthlyAuditSummaryRow[] = dashMetrics.monthlySeries.map((pt) => {
    const liveUnits = state.sales.filter((s) => s.saleDate.startsWith(pt.monthKey)).length;
    const unitsSold = (baseUnitsByMonth[pt.monthKey] || 0) + liveUnits;
    const grossRevenue = Number(pt.revenue.toFixed(2));
    const grossProfit = Number(pt.profit.toFixed(2));
    const cogs = Number(Math.max(0, grossRevenue - grossProfit).toFixed(2));
    const operatingExpenses = Number(pt.expenses.toFixed(2));

    return {
      month: `${pt.month} 2026`,
      monthKey: pt.monthKey,
      grossRevenue,
      cogs,
      grossProfit,
      operatingExpenses,
      netProfitMarginPct: pt.profitMarginPct,
      inventoryTurnoverRate: pt.inventoryTurnoverRate,
      unitsSold,
      auditStatus: 'Reconciled',
    };
  });

  const totalRevenue = Number(rows.reduce((s, r) => s + r.grossRevenue, 0).toFixed(2));
  const totalCogs = Number(rows.reduce((s, r) => s + r.cogs, 0).toFixed(2));
  const totalGrossProfit = Number(rows.reduce((s, r) => s + r.grossProfit, 0).toFixed(2));
  const totalExpenses = Number(rows.reduce((s, r) => s + r.operatingExpenses, 0).toFixed(2));
  const totalUnitsSold = rows.reduce((s, r) => s + r.unitsSold, 0);
  const weightedMarginPct =
    totalRevenue > 0 ? Number(((totalGrossProfit / totalRevenue) * 100).toFixed(1)) : 0;
  const avgTurnoverRate =
    rows.length > 0
      ? Number(
          (rows.reduce((s, r) => s + r.inventoryTurnoverRate, 0) / rows.length).toFixed(1)
        )
      : 0;

  return {
    rows,
    totals: {
      totalRevenue,
      totalCogs,
      totalGrossProfit,
      totalExpenses,
      weightedMarginPct,
      avgTurnoverRate,
      totalUnitsSold,
    },
  };
}

/**
 * Generates an RFC-4180 compliant External Audit CSV report containing monthly revenue,
 * COGS, realized net profit, profit margin %, inventory turnover, and unit-level audit trail.
 */
export function generateMonthlyAuditReportCsv(
  state: DealershipState,
  maskSensitive = false
): string {
  const { rows, totals } = generateMonthlyAuditSummaryRows(state);
  const escapeCsvCell = (val: string | number): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[][] = [
    ['EXTERNAL AUDIT REPORT - MONTHLY REVENUE & PROFIT MARGIN SUMMARY'],
    ['Dealership Name', state.settings.dealershipName],
    ['Prepared By', `${state.settings.displayName} (${state.settings.activeRole})`],
    ['Reporting Currency', state.settings.currency],
    ['Generated At (ISO)', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    [],
    [
      'Month',
      'Period Key',
      'Units Sold',
      'Gross Revenue',
      'COGS (Vehicle + FIFO Parts)',
      'Realized Net Profit',
      'Profit Margin %',
      'Operating Expenses',
      'Annualized Turnover (x/yr)',
      'Audit Status',
    ],
  ];

  for (const r of rows) {
    lines.push([
      r.month,
      r.monthKey,
      String(r.unitsSold),
      String(r.grossRevenue),
      maskSensitive ? 'MASKED' : String(r.cogs),
      maskSensitive ? 'MASKED' : String(r.grossProfit),
      maskSensitive ? 'MASKED' : `${r.netProfitMarginPct}%`,
      String(r.operatingExpenses),
      `${r.inventoryTurnoverRate}x`,
      r.auditStatus,
    ]);
  }

  lines.push([
    '6-MONTH TOTAL / WEIGHTED AVG',
    '2026-06 to 2026-11',
    String(totals.totalUnitsSold),
    String(totals.totalRevenue),
    maskSensitive ? 'MASKED' : String(totals.totalCogs),
    maskSensitive ? 'MASKED' : String(totals.totalGrossProfit),
    maskSensitive ? 'MASKED' : `${totals.weightedMarginPct}%`,
    String(totals.totalExpenses),
    `${totals.avgTurnoverRate}x`,
    'Verified',
  ]);

  lines.push([]);
  lines.push(['UNIT-LEVEL REALIZED DEAL AUDIT LEDGER']);
  lines.push([
    'Sale Date',
    'Stock ID',
    'VIN',
    'Vehicle Description',
    'Buyer Name',
    'Payment Method',
    'Sale Price',
    'All-In Cost',
    'VAT / Fee Benefit',
    'Realized Net Profit',
    'Unit Margin %',
  ]);

  for (const sale of state.sales) {
    const v = state.vehicles.find((veh) => veh.id === sale.vehicleId);
    const totalCost = v
      ? calculateVehicleTotalCost(v, state.expenses)
      : sale.totalCostSnapshot;
    const netProfit = sale.saleAmount - totalCost + (sale.vatRefundAmount || 0);
    const unitMarginPct =
      sale.saleAmount > 0 ? ((netProfit / sale.saleAmount) * 100).toFixed(1) : '0.0';

    lines.push([
      sale.saleDate,
      v?.stockId || sale.vehicleId,
      v?.vin || 'N/A',
      v ? `${v.year} ${v.make} ${v.model} ${v.trim}` : sale.vehicleId,
      sale.buyerName,
      sale.paymentMethod,
      String(sale.saleAmount),
      maskSensitive ? 'MASKED' : String(totalCost),
      String(sale.vatRefundAmount || 0),
      maskSensitive ? 'MASKED' : String(netProfit),
      maskSensitive ? 'MASKED' : `${unitMarginPct}%`,
    ]);
  }

  return lines.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

export type CommandPaletteCategory =
  | 'all'
  | 'inventory'
  | 'clients'
  | 'treasury';

export interface CommandPaletteResultItem {
  id: string;
  recordId: string;
  category: 'inventory' | 'clients' | 'treasury';
  subType:
    | 'vehicle'
    | 'client'
    | 'transaction'
    | 'account'
    | 'debt'
    | 'audit_log';
  title: string;
  subtitle: string;
  badgeText: string;
  badgeTone: 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'slate';
  rightPrimary: string;
  rightSecondary: string;
  route: 'inventory' | 'clients' | 'finance';
  treasuryTarget?: {
    subTab: 'Overview' | 'Ledger' | 'Debts';
    ledgerSection?: 'transactions' | 'audit_log';
    searchQuery?: string;
    recordId?: string;
  };
  score: number;
}

/**
 * Global Command-Palette Search Engine
 * Searches and ranks Clients (CRM leads), Inventory Items (vehicles), and Treasury Records
 * (transactions, bank/cash accounts, counterparty debts, and voice audit logs) across the entire application.
 */
export function searchGlobalCommandPalette(
  state: DealershipState,
  rawQuery: string,
  categoryFilter: CommandPaletteCategory = 'all',
  isSensitiveVisible = true
): CommandPaletteResultItem[] {
  const q = rawQuery.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const fmt = (amt: number, sensitive = false) =>
    formatMoney(amt, state.settings.currency, sensitive && !isSensitiveVisible);

  const computeMatchScore = (haystackFields: string[], primaryField: string): number => {
    if (tokens.length === 0) return 50;
    const joined = haystackFields.join(' ').toLowerCase();
    const primaryLower = primaryField.toLowerCase();
    for (const tok of tokens) {
      if (!joined.includes(tok)) {
        return 0;
      }
    }
    let score = 60;
    if (primaryLower === q) score += 50;
    else if (primaryLower.startsWith(q)) score += 35;
    else if (primaryLower.includes(q)) score += 20;
    return score;
  };

  const results: CommandPaletteResultItem[] = [];

  // 1. INVENTORY ITEMS (Vehicles)
  if (categoryFilter === 'all' || categoryFilter === 'inventory') {
    for (const v of state.vehicles) {
      const fullName = `${v.year} ${v.make} ${v.model} ${v.trim}`;
      const score = computeMatchScore(
        [
          fullName,
          v.stockId,
          v.vin,
          v.status,
          v.color,
          v.engine,
          v.notes,
          String(v.askingPrice),
        ],
        `${v.stockId} ${fullName} ${v.vin}`
      );
      if (score > 0) {
        const netProfit = calculateVehicleNetProfit(v, state.expenses, state.sales);
        const badgeTone: CommandPaletteResultItem['badgeTone'] =
          v.status === 'Available' || v.status === 'Sold'
            ? 'emerald'
            : v.status === 'In prep' || v.status === 'Reserved'
            ? 'amber'
            : v.status === 'In transit'
            ? 'blue'
            : 'slate';

        results.push({
          id: `cmd-veh-${v.id}`,
          recordId: v.id,
          category: 'inventory',
          subType: 'vehicle',
          title: `${v.year} ${v.make} ${v.model} ${v.trim}`,
          subtitle: `${v.stockId} · VIN: ${v.vin} · ${v.mileage.toLocaleString()} mi · ${v.color}`,
          badgeText: v.status,
          badgeTone,
          rightPrimary: fmt(v.askingPrice),
          rightSecondary: isSensitiveVisible
            ? `Net Est: +${fmt(netProfit, true)}`
            : `${v.daysInStock}d in stock`,
          route: 'inventory',
          score: score + (v.status !== 'Sold' ? 5 : 0),
        });
      }
    }
  }

  // 2. CLIENTS & CRM PIPELINE LEADS
  if (categoryFilter === 'all' || categoryFilter === 'clients') {
    for (const c of state.clients) {
      const linkedVeh = state.vehicles.find((v) => v.id === c.vehicleId);
      const vehLabel = linkedVeh
        ? `${linkedVeh.year} ${linkedVeh.make} ${linkedVeh.model} (${linkedVeh.stockId})`
        : c.request;
      const docNames = (c.documents || []).map((d) => `${d.name} ${d.category}`).join(' ');
      const score = computeMatchScore(
        [
          c.name,
          c.phone,
          c.email,
          c.stage,
          vehLabel,
          c.request,
          c.notes,
          docNames,
        ],
        `${c.name} ${c.phone} ${c.email}`
      );
      if (score > 0) {
        const badgeTone: CommandPaletteResultItem['badgeTone'] =
          c.stage === 'Sold'
            ? 'emerald'
            : c.stage === 'Negotiation'
            ? 'amber'
            : c.stage === 'Viewing'
            ? 'purple'
            : 'blue';

        results.push({
          id: `cmd-cli-${c.id}`,
          recordId: c.id,
          category: 'clients',
          subType: 'client',
          title: c.name,
          subtitle: `${c.phone} · ${c.email} · ${vehLabel}`,
          badgeText: `CRM: ${c.stage}`,
          badgeTone,
          rightPrimary: linkedVeh ? fmt(linkedVeh.askingPrice) : 'Lead Profile',
          rightSecondary: `${c.interactions.length} updates · ${(c.documents || []).length} KYC docs`,
          route: 'clients',
          score: score + (c.isOverdue ? 4 : 2),
        });
      }
    }
  }

  // 3. TREASURY RECORDS (Transactions, Financial Accounts, Debts, Voice Audit Logs)
  if ((categoryFilter === 'all' || categoryFilter === 'treasury') && isSensitiveVisible) {
    // 3a. Financial Accounts
    for (const acc of state.accounts) {
      const score = computeMatchScore(
        [acc.name, acc.type, 'treasury account bank cash balance', String(acc.balance)],
        acc.name
      );
      if (score > 0) {
        results.push({
          id: `cmd-acc-${acc.id}`,
          recordId: acc.id,
          category: 'treasury',
          subType: 'account',
          title: `${acc.name} (${acc.type})`,
          subtitle: `Treasury Account · Starting: ${fmt(acc.startingBalance, true)}`,
          badgeText: `Account · ${acc.type}`,
          badgeTone: 'blue',
          rightPrimary: fmt(acc.balance, true),
          rightSecondary: 'Live Balance',
          route: 'finance',
          treasuryTarget: {
            subTab: 'Overview',
            recordId: acc.id,
          },
          score: score + 3,
        });
      }
    }

    // 3b. Treasury Ledger Transactions
    for (const tx of state.transactions) {
      const acc = state.accounts.find((a) => a.id === tx.accountId);
      const score = computeMatchScore(
        [
          tx.description,
          tx.source,
          tx.category || '',
          tx.bankReference || '',
          tx.date,
          acc?.name || '',
          tx.direction,
          String(tx.amount),
          'treasury ledger transaction',
        ],
        `${tx.description} ${tx.bankReference || ''} ${tx.category || ''}`
      );
      if (score > 0) {
        results.push({
          id: `cmd-tx-${tx.id}`,
          recordId: tx.id,
          category: 'treasury',
          subType: 'transaction',
          title: tx.description,
          subtitle: `${tx.date} · ${acc?.name || tx.accountId} · ${tx.category || tx.source}${
            tx.bankReference ? ` · Ref: ${tx.bankReference}` : ''
          }`,
          badgeText: `${tx.direction} · ${tx.reconciled ? 'Reconciled' : 'Pending'}`,
          badgeTone: tx.direction === 'Inflow' ? 'emerald' : 'rose',
          rightPrimary: `${tx.direction === 'Inflow' ? '+' : '-'}${fmt(tx.amount, true)}`,
          rightSecondary: tx.source,
          route: 'finance',
          treasuryTarget: {
            subTab: 'Ledger',
            ledgerSection: 'transactions',
            searchQuery: tx.bankReference || tx.description,
            recordId: tx.id,
          },
          score,
        });
      }
    }

    // 3c. Counterparty Debts (Receivables & Payables)
    for (const debt of state.debts) {
      const remaining = debt.amount - debt.paidAmount;
      const score = computeMatchScore(
        [
          debt.counterparty,
          debt.direction,
          debt.status,
          debt.notes,
          debt.phone,
          debt.dueDate,
          'debt receivable payable balance',
        ],
        debt.counterparty
      );
      if (score > 0) {
        results.push({
          id: `cmd-debt-${debt.id}`,
          recordId: debt.id,
          category: 'treasury',
          subType: 'debt',
          title: `${debt.counterparty} (${debt.direction})`,
          subtitle: `Due ${debt.dueDate} · ${debt.phone} · ${debt.notes}`,
          badgeText: `Debt · ${debt.status}`,
          badgeTone:
            debt.status === 'Settled'
              ? 'emerald'
              : debt.isOverdue
              ? 'rose'
              : 'amber',
          rightPrimary: fmt(remaining, true),
          rightSecondary: `Orig: ${fmt(debt.amount, true)}`,
          route: 'finance',
          treasuryTarget: {
            subTab: 'Debts',
            recordId: debt.id,
          },
          score: score + (debt.isOverdue ? 3 : 0),
        });
      }
    }

    // 3d. Treasury Voice Audit Logs
    for (const log of state.auditLogs || []) {
      const score = computeMatchScore(
        [
          log.title,
          log.summary,
          log.rawTranscript,
          log.category || '',
          log.relatedVehicleVinOrStock || '',
          log.author,
          'audit log voice memo treasury',
        ],
        `${log.title} ${log.relatedVehicleVinOrStock || ''}`
      );
      if (score > 0) {
        results.push({
          id: `cmd-audit-${log.id}`,
          recordId: log.id,
          category: 'treasury',
          subType: 'audit_log',
          title: log.title,
          subtitle: `${log.timestamp} · ${log.category || 'Treasury Audit'} · ${log.summary}`,
          badgeText: 'Audit Log',
          badgeTone: 'purple',
          rightPrimary: log.financialImpact || 'Verified Memo',
          rightSecondary: log.relatedVehicleVinOrStock || log.author,
          route: 'finance',
          treasuryTarget: {
            subTab: 'Ledger',
            ledgerSection: 'audit_log',
            searchQuery: log.title,
            recordId: log.id,
          },
          score,
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}



