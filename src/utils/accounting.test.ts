import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateFifoPartBatches,
  buildDealerAssistantResponse,
  calculateDashboardMetrics,
  calculateDealProfitEstimate,
  calculateProjectedMonthlyGrowth,
  calculateVehicleMarginPct,
  calculateVehicleNetProfit,
  calculateVehicleTotalCost,
  canMutateWorkspace,
  canViewSensitiveFinancials,
  createLocalKycDocumentBlobUrl,
  createScannedDocumentBlobUrl,
  formatMoney,
  generateMonthlyAuditReportCsv,
  generateMonthlyAuditSummaryRows,
  generatePartReorderRequest,
  generateVoiceAuditSummary,
  getLowStockPartAlerts,
  parsePartsCsvText,
  parseSmartPasteVehicleText,
  SAMPLE_PARTS_CSV_TEMPLATE,
  searchGlobalCommandPalette,
  settleDebtRecord,
  updateAccountBalance,
} from './accounting';
import { INITIAL_DEALERSHIP_STATE } from '../data/seedData';
import { DebtRecord, Expense, FinancialAccount, PartBatch, Vehicle } from '../types';

const mockVehicle: Vehicle = {
  id: 'v-1',
  stockId: 'CDT-101',
  vin: '1HGCV1F34LA012345',
  year: 2020,
  make: 'Honda',
  model: 'Accord',
  trim: 'Sport 1.5T',
  color: 'White',
  colorHex: '#f8fafc',
  engine: '1.5L Turbo I4',
  drivetrain: 'FWD',
  mileage: 41200,
  purchasePrice: 16500,
  askingPrice: 21900,
  retailValue: 22400,
  wholesaleValue: 17200,
  purchaseDate: '2026-10-18',
  daysInStock: 22,
  accruedHoldingCost: 110,
  status: 'Available',
  paidFromAccountId: 'acc-1',
  coverPhoto: '',
  bodyFuelNotes: 'Sedan · Gasoline',
  notes: 'Clean Carfax',
};

const mockExpenses: Expense[] = [
  {
    id: 'e-1',
    amount: 350,
    date: '2026-10-20',
    category: 'Detailing',
    type: 'Vehicle-linked',
    vehicleId: 'v-1',
    teamMember: 'Alex Rivera',
    paidFromAccountId: 'acc-1',
    description: 'Full ceramic paint correction',
  },
  {
    id: 'e-2',
    amount: 240,
    date: '2026-10-22',
    category: 'Repairs',
    type: 'Vehicle-linked',
    vehicleId: 'v-1',
    teamMember: 'Alex Rivera',
    paidFromAccountId: 'acc-1',
    description: 'Front brake pads & rotor resurface',
  },
  {
    id: 'e-3',
    amount: 1200,
    date: '2026-10-01',
    category: 'Rent',
    type: 'General Overhead',
    teamMember: 'Alex Rivera',
    paidFromAccountId: 'acc-1',
    description: 'Lot lease',
  },
];

test('One Profit Everywhere: Vehicle Total Cost & Projected Net Profit formula', () => {
  // Total Cost = 16500 (purchase) + (350 + 240 linked expenses) + 110 (holding cost) = 17200
  const totalCost = calculateVehicleTotalCost(mockVehicle, mockExpenses);
  assert.equal(totalCost, 17200);

  // Projected Net Profit = 21900 (asking) - 17200 (total cost) = 4700
  const netProfit = calculateVehicleNetProfit(mockVehicle, mockExpenses, []);
  assert.equal(netProfit, 4700);

  // Margin % = (4700 / 21900) * 100 = 21.5%
  const marginPct = calculateVehicleMarginPct(mockVehicle, mockExpenses, []);
  assert.equal(marginPct, 21.5);
});

test('FIFO Part Batch Allocation deducts from oldest batch first and computes exact FIFO cost', () => {
  const batches: PartBatch[] = [
    {
      id: 'b-new',
      partId: 'p-1',
      batchLabel: 'Batch #B2 (Nov)',
      purchaseDate: '2026-11-01',
      initialQty: 5,
      remainingQty: 5,
      unitCost: 60,
      paidFromAccountId: 'acc-1',
    },
    {
      id: 'b-old',
      partId: 'p-1',
      batchLabel: 'Batch #B1 (Sep)',
      purchaseDate: '2026-09-15',
      initialQty: 4,
      remainingQty: 2,
      unitCost: 45,
      paidFromAccountId: 'acc-1',
    },
  ];

  // Request 4 units: should take all 2 from b-old ($45 * 2 = $90) + 2 from b-new ($60 * 2 = $120) = $210
  const result = allocateFifoPartBatches(batches, 'p-1', 4);
  assert.equal(result.totalFifoCost, 210);
  assert.equal(result.allocations.length, 2);
  assert.equal(result.allocations[0].batchId, 'b-old');
  assert.equal(result.allocations[0].qtyUsed, 2);
  assert.equal(result.allocations[1].batchId, 'b-new');
  assert.equal(result.allocations[1].qtyUsed, 2);

  const oldAfter = result.updatedBatches.find((b) => b.id === 'b-old')!;
  const newAfter = result.updatedBatches.find((b) => b.id === 'b-new')!;
  assert.equal(oldAfter.remainingQty, 0);
  assert.equal(newAfter.remainingQty, 3);
});

test('RBAC permissions enforce financial masking and viewer mutation lock', () => {
  assert.equal(canViewSensitiveFinancials('Owner'), true);
  assert.equal(canViewSensitiveFinancials('Admin'), true);
  assert.equal(canViewSensitiveFinancials('Sales'), false);
  assert.equal(canViewSensitiveFinancials('Viewer'), false);

  assert.equal(canMutateWorkspace('Owner'), true);
  assert.equal(canMutateWorkspace('Sales'), true);
  assert.equal(canMutateWorkspace('Viewer'), false);

  assert.equal(formatMoney(16500, 'USD', true), '••••••');
  assert.equal(formatMoney(16500, 'USD', false), '$16,500');
});

test('Treasury account balance and counterparty debt settlement math', () => {
  const accounts: FinancialAccount[] = [
    { id: 'acc-1', name: 'Operating Bank', type: 'Bank', balance: 48500, startingBalance: 45000 },
  ];
  const updated = updateAccountBalance(accounts, 'acc-1', -1500);
  assert.equal(updated[0].balance, 47000);

  const debt: DebtRecord = {
    id: 'd-1',
    counterparty: 'Metro Auto Auction',
    direction: 'Owed to me',
    amount: 3200,
    paidAmount: 1000,
    date: '2026-10-10',
    dueDate: '2026-11-01',
    isOverdue: true,
    phone: '555-0199',
    notes: 'Arbitration credit',
    status: 'Partial',
  };

  const settled = settleDebtRecord(debt, 2200);
  assert.equal(settled.paidAmount, 3200);
  assert.equal(settled.status, 'Settled');
  assert.equal(settled.isOverdue, false);
});

test('Smart Paste vehicle listing parser extracts VIN, Year, Make, Model, Mileage, and Prices', () => {
  const parsed = parseSmartPasteVehicleText(
    '2021 BMW 330i M Sport AWD VIN 5TDKZ3DC8LS054321 with 34,200 miles in Blue, bought for $24,000 asking $29,500 2.0L Turbo'
  );
  assert.equal(parsed.year, 2021);
  assert.equal(parsed.make, 'BMW');
  assert.equal(parsed.model, '330i');
  assert.equal(parsed.vin, '5TDKZ3DC8LS054321');
  assert.equal(parsed.mileage, 34200);
  assert.equal(parsed.purchasePrice, 24000);
  assert.equal(parsed.askingPrice, 29500);
  assert.equal(parsed.drivetrain, 'AWD');
});

test('Voice-to-Work AI Assistant generates Before->After PendingActionPreview across action types and enforces RBAC', () => {
  // 1. create_expense proposal
  const expProposal = buildDealerAssistantResponse('Add a 250 fuel expense', INITIAL_DEALERSHIP_STATE);
  assert.ok(expProposal.pendingAction);
  assert.equal(expProposal.pendingAction.actionType, 'create_expense');
  assert.equal(expProposal.pendingAction.payload.amount, 250);
  assert.equal(expProposal.pendingAction.payload.category, 'Transport');

  // 2. update_vehicle proposal
  const updProposal = buildDealerAssistantResponse('Change Accord asking price to 22400', INITIAL_DEALERSHIP_STATE);
  assert.ok(updProposal.pendingAction);
  assert.equal(updProposal.pendingAction.actionType, 'update_vehicle');
  assert.equal(updProposal.pendingAction.payload.askingPrice, 22400);

  // 3. add_debt proposal
  const debtProposal = buildDealerAssistantResponse('John owes me 1200 for trade-in balance', INITIAL_DEALERSHIP_STATE);
  assert.ok(debtProposal.pendingAction);
  assert.equal(debtProposal.pendingAction.actionType, 'add_debt');
  assert.equal(debtProposal.pendingAction.payload.amount, 1200);
  assert.equal(debtProposal.pendingAction.payload.direction, 'Owed to me');

  // 4. RBAC masking for Sales role on analytical stock query
  const salesState = {
    ...INITIAL_DEALERSHIP_STATE,
    settings: { ...INITIAL_DEALERSHIP_STATE.settings, activeRole: 'Sales' as const },
  };
  const stockReply = buildDealerAssistantResponse('How many cars are in stock?', salesState);
  assert.ok(stockReply.reply.includes('masked for your role'));
  assert.ok(!stockReply.reply.includes('Total Capital Invested'));
});

test('Dashboard state aggregation (calculateDashboardMetrics) computes inventory values, sales revenue, net profit, and expenses', () => {
  const allTime = calculateDashboardMetrics(INITIAL_DEALERSHIP_STATE, 'all');
  // 4 active vehicles: Accord ($16,500), BMW ($24,000), Corolla ($1,000), F-150 ($34,500) = $76,000 purchase base
  assert.equal(allTime.activeVehiclesCount, 4);
  assert.equal(allTime.soldVehiclesCount, 2);
  assert.equal(allTime.inventoryPurchaseValue, 76000);
  // All-in investment = $16,920 + $24,530 + $1,195 + $34,915 = $77,560
  assert.equal(allTime.inventoryTotalInvestmentValue, 77560);
  // Retail asking = $21,900 + $29,500 + $2,900 + $41,800 = $96,100
  assert.equal(allTime.inventoryRetailAskingValue, 96100);
  // Projected stock profit = $96,100 - $77,560 = $18,540
  assert.equal(allTime.projectedInventoryProfit, 18540);
  // Completed vehicle sales ($25,200 + $21,600 = $46,800) + 1 counter part sale ($178) = $46,978
  assert.equal(allTime.vehicleSalesRevenue, 46800);
  assert.equal(allTime.partSalesRevenue, 178);
  assert.equal(allTime.totalSalesRevenue, 46978);
  // Realized vehicle profit ($4,900 + $4,460 = $9,360) + part sale profit ($70) = $9,430
  assert.equal(allTime.realizedVehicleProfit, 9360);
  assert.equal(allTime.realizedPartProfit, 70);
  assert.equal(allTime.totalRealizedProfit, 9430);
  // Total expenses = $280 + $420 + $350 + $340 + $1,450 = $2,840 ($1,390 recon + $1,450 overhead)
  assert.equal(allTime.totalExpensesSum, 2840);
  assert.equal(allTime.vehicleLinkedExpensesSum, 1390);
  assert.equal(allTime.generalOverheadExpensesSum, 1450);
  assert.equal(allTime.monthlySeries.length, 6);
});

test('generateVoiceAuditSummary creates structured title, category, impact, and executive summary from voice dictation', () => {
  // Test 1: Detailing / Recon dictation
  const reconDictation = 'Paid two hundred eighty dollars for ceramic detailing on the Honda Accord from petty cash';
  const reconSummary = generateVoiceAuditSummary(reconDictation, INITIAL_DEALERSHIP_STATE);
  assert.equal(reconSummary.category, 'Reconditioning & Detailing');
  assert.ok(reconSummary.title.includes('Accord') || reconSummary.title.includes('Recon'));
  assert.ok(reconSummary.summary.includes('Accord') || reconSummary.summary.includes('CDT-101'));
  assert.ok(reconSummary.financialImpact?.includes('280'));

  // Test 2: Floorplan acquisition dictation
  const acquisitionDictation = 'Approved thirty four thousand five hundred on floorplan for Ford F-150';
  const acqSummary = generateVoiceAuditSummary(acquisitionDictation, INITIAL_DEALERSHIP_STATE);
  assert.equal(acqSummary.category, 'Vehicle Acquisition');
  assert.ok(acqSummary.relatedVehicleVinOrStock === 'CDT-104' || acqSummary.title.includes('F-150'));

  // Test 3: Carrier transport fee
  const transportDictation = 'Dispatched carrier for three hundred fifty dollars transport surcharge';
  const transportSummary = generateVoiceAuditSummary(transportDictation, INITIAL_DEALERSHIP_STATE);
  assert.equal(transportSummary.category, 'Transport & Towing');
  assert.ok(transportSummary.financialImpact?.includes('350'));
});

test('parsePartsCsvText accurately parses structured CSV, applies FIFO headers, strips quotes/currency, and catches errors', () => {
  // Test 1: Sample CSV template parsing
  const templateResult = parsePartsCsvText(SAMPLE_PARTS_CSV_TEMPLATE);
  assert.equal(templateResult.totalValid, 5);
  assert.equal(templateResult.errors.length, 0);
  assert.equal(templateResult.items[0].code, 'BRK-AKE-02');
  assert.equal(templateResult.items[0].name, 'Akebono Ultra Ceramic Rear Pads');
  assert.equal(templateResult.items[0].quantity, 10);
  assert.equal(templateResult.items[0].unitCost, 48.5);
  assert.equal(templateResult.items[0].category, 'Brakes');
  assert.equal(templateResult.items[0].batchLabel, 'BATCH-NOV-01');
  assert.equal(templateResult.items[0].purchaseDate, '2026-11-01');

  // Test 2: Custom CSV with quoted commas, dollar signs, and mixed headers
  const customCsv = `SKU,Part Description,Group,Count,Price Each,Lot #,Date
"BRK-PAD-F","Akebono Ultra-Premium Front Brake Pads, Ceramic",Brakes,10,"$45.50",LOT-8899,2026-11-05
WIP-BLD-22,Bosch Icon 22" Wiper Blade,Accessories,15,$14.25,,2026-11-06`;

  const customResult = parsePartsCsvText(customCsv);
  assert.equal(customResult.totalValid, 2);
  assert.equal(customResult.errors.length, 0);
  assert.equal(customResult.items[0].code, 'BRK-PAD-F');
  assert.equal(customResult.items[0].name, 'Akebono Ultra-Premium Front Brake Pads, Ceramic');
  assert.equal(customResult.items[0].quantity, 10);
  assert.equal(customResult.items[0].unitCost, 45.5);
  assert.equal(customResult.items[0].batchLabel, 'LOT-8899');
  assert.equal(customResult.items[0].purchaseDate, '2026-11-05');

  // Second item auto-generates a batch label because lot was omitted
  assert.equal(customResult.items[1].code, 'WIP-BLD-22');
  assert.equal(customResult.items[1].quantity, 15);
  assert.equal(customResult.items[1].unitCost, 14.25);
  assert.ok(customResult.items[1]?.batchLabel?.startsWith('BATCH-20261106-'));

  // Test 3: Validation errors on negative/invalid values and missing codes
  const faultyCsv = `Code,Name,Quantity,UnitCost
,,10,25.00
BAD-QTY,Test Item,notanumber,15.00
BAD-COST,Negative Cost,5,-10.00`;

  const faultyResult = parsePartsCsvText(faultyCsv);
  assert.equal(faultyResult.totalValid, 0);
  assert.equal(faultyResult.errors.length, 3);
  assert.ok(faultyResult.errors[0].includes('Missing both Part Code and Part Name'));
  assert.ok(faultyResult.errors[1].includes('Quantity must be a positive integer'));
  assert.ok(faultyResult.errors[2].includes('Unit cost must be a non-negative number'));
});

test('getLowStockPartAlerts flags parts based on historical usage velocity and generatePartReorderRequest creates PO', () => {
  // In INITIAL_DEALERSHIP_STATE, BAT-AGM-H6 has initial: 4, remaining: 2 (consumed: 2)
  const alerts = getLowStockPartAlerts(INITIAL_DEALERSHIP_STATE);
  assert.ok(alerts.length >= 1);

  const batteryAlert = alerts.find((a) => a.code === 'BAT-AGM-H6');
  assert.ok(batteryAlert);
  assert.equal(batteryAlert.currentStock, 2);
  assert.ok(batteryAlert.monthlyBurnRate > 0);
  assert.ok(batteryAlert.safetyStockThreshold >= 2);
  assert.ok(batteryAlert.suggestedReorderQty >= 4);
  assert.equal(batteryAlert.estimatedUnitCost, 165);
  assert.equal(batteryAlert.totalEstimatedCost, batteryAlert.suggestedReorderQty * 165);

  // 1-Click Reorder Request Generation
  const po = generatePartReorderRequest(batteryAlert.partId, INITIAL_DEALERSHIP_STATE);
  assert.ok(po.id.startsWith('po-'));
  assert.equal(po.partId, batteryAlert.partId);
  assert.equal(po.partCode, 'BAT-AGM-H6');
  assert.equal(po.suggestedQty, batteryAlert.suggestedReorderQty);
  assert.equal(po.status, 'Ordered');
  assert.equal(po.estimatedUnitCost, 165);
});

test('calculateDashboardMetrics computes profitMarginPct and inventoryTurnoverRate for recharts trend visualization', () => {
  const metrics = calculateDashboardMetrics(INITIAL_DEALERSHIP_STATE, 'all');
  assert.equal(metrics.monthlySeries.length, 6);

  // Jun (baseRev: 18400, baseProf: 3100) -> Margin % = (3100 / 18400) * 100 = 16.8%
  const jun = metrics.monthlySeries.find((m) => m.month === 'Jun')!;
  assert.equal(jun.profitMarginPct, 16.8);
  assert.ok(jun.inventoryTurnoverRate > 2.0);

  // Oct (Oct 2026 sales in seedData: $25,378 rev, $4,970 profit) -> Margin % = 19.6%
  const oct = metrics.monthlySeries.find((m) => m.month === 'Oct')!;
  assert.equal(oct.revenue, 25378);
  assert.equal(oct.profit, 4970);
  assert.equal(oct.profitMarginPct, 19.6);
  assert.ok(oct.inventoryTurnoverRate > 3.0);

  // Nov (Nov 2026 sales in seedData: $21,600 rev, $4,460 profit) -> Margin % = 20.6%
  const nov = metrics.monthlySeries.find((m) => m.month === 'Nov')!;
  assert.equal(nov.revenue, 21600);
  assert.equal(nov.profit, 4460);
  assert.equal(nov.profitMarginPct, 20.6);
  assert.ok(nov.inventoryTurnoverRate > 2.5);
});

test('calculateDealProfitEstimate integrates purchase cost, FIFO PartsView reconditioning batches, and overhead allocations', () => {
  // Using part-1 (Akebono brake pads @ $54 FIFO) and part-2 (OEM Oil Filter @ $11 FIFO)
  const estimate = calculateDealProfitEstimate(
    {
      salePrice: 21900,
      purchaseCost: 16500,
      existingReconCost: 280,
      manualReconCost: 120,
      selectedParts: [
        { partId: 'part-1', quantity: 1 }, // $54
        { partId: 'part-2', quantity: 2 }, // 2 * $11 = $22
      ],
      fixedOverheadAllocation: 350,
      overheadPackPct: 1, // 1% of 16500 = $165
      holdingCostAllocation: 140,
      vatOrDocFeeBenefit: 0,
    },
    INITIAL_DEALERSHIP_STATE.partBatches,
    INITIAL_DEALERSHIP_STATE.parts
  );

  assert.equal(estimate.fifoPartsReconCost, 76); // 54 + 22
  assert.equal(estimate.totalReconCost, 476); // 280 + 120 + 76
  assert.equal(estimate.variableOverheadCost, 165);
  assert.equal(estimate.totalOverheadCost, 655); // 350 + 165 + 140
  assert.equal(estimate.totalAllInCost, 17631); // 16500 + 476 + 655
  assert.equal(estimate.estimatedNetProfit, 4269); // 21900 - 17631
  assert.equal(estimate.netProfitMarginPct, 19.5);
  assert.equal(estimate.marginHealth, 'Strong');
  assert.equal(estimate.partsBreakdown.length, 2);
});

test('createLocalKycDocumentBlobUrl synthesizes a local session object URL for client KYC storage', () => {
  const kycBlob = createLocalKycDocumentBlobUrl({
    clientName: 'John Miller',
    category: 'Driver License',
    docNumber: 'TX-38491029',
  });
  assert.ok(
    kycBlob.objectUrl.startsWith('blob:') ||
      kycBlob.objectUrl.startsWith('data:image/svg+xml')
  );
  assert.equal(kycBlob.mimeType, 'image/svg+xml');
  assert.ok(kycBlob.sizeBytes > 500);
  assert.ok(kycBlob.fileName.includes('John_Miller_Driver_License'));
});

test('createScannedDocumentBlobUrl generates optical camera scan blobs for Vehicle Titles and Service Invoices', () => {
  const titleScan = createScannedDocumentBlobUrl({
    docType: 'Vehicle Title',
    referenceCode: 'TTL-TX-884210',
    primaryTitle: '2020 Honda Accord Sport Title',
    counterpartyOrVendor: 'John Miller',
    vinOrSku: '1HGCV1F34LA019284',
    amountText: '$18,500.00',
  });
  assert.ok(
    titleScan.objectUrl.startsWith('blob:') ||
      titleScan.objectUrl.startsWith('data:image/svg+xml')
  );
  assert.equal(titleScan.mimeType, 'image/svg+xml');
  assert.ok(titleScan.fileName.includes('Title_Scan_TTL-TX-884210'));

  const invoiceScan = createScannedDocumentBlobUrl({
    docType: 'Service Invoice',
    referenceCode: 'INV-SVC-40912',
    primaryTitle: 'Akebono ProACT Ceramic Brake Pads',
    counterpartyOrVendor: 'WorldPac OEM Auto Parts',
    vinOrSku: 'BRK-PAD-01',
    amountText: '$312.00',
  });
  assert.ok(invoiceScan.fileName.includes('Invoice_Scan_INV-SVC-40912'));
  assert.ok(invoiceScan.sizeBytes > 600);
});

test('generateMonthlyAuditSummaryRows and generateMonthlyAuditReportCsv compute 6-month revenue and profit margin audit summaries', () => {
  const summary = generateMonthlyAuditSummaryRows(INITIAL_DEALERSHIP_STATE);
  assert.equal(summary.rows.length, 6);
  assert.ok(summary.totals.totalRevenue > 130000);
  assert.ok(summary.totals.totalGrossProfit > 24000);
  assert.ok(summary.totals.weightedMarginPct > 15);
  assert.ok(summary.totals.avgTurnoverRate > 2.5);

  const csvUnmasked = generateMonthlyAuditReportCsv(INITIAL_DEALERSHIP_STATE, false);
  assert.ok(csvUnmasked.includes('EXTERNAL AUDIT REPORT - MONTHLY REVENUE & PROFIT MARGIN SUMMARY'));
  assert.ok(csvUnmasked.includes('6-MONTH TOTAL / WEIGHTED AVG'));
  assert.ok(csvUnmasked.includes('UNIT-LEVEL REALIZED DEAL AUDIT LEDGER'));
  assert.ok(csvUnmasked.includes('Nov 2026'));

  const csvMasked = generateMonthlyAuditReportCsv(INITIAL_DEALERSHIP_STATE, true);
  assert.ok(csvMasked.includes('MASKED'));
});

test('calculateProjectedMonthlyGrowth computes AI-driven 6-month trendline and next-month (Dec 2026) forecast across scenarios', () => {
  const metrics = calculateDashboardMetrics(INITIAL_DEALERSHIP_STATE, 'all');
  assert.equal(metrics.monthlySeries.length, 6);
  assert.equal(metrics.projectedSeriesWithForecast.length, 7);

  const baseline = calculateProjectedMonthlyGrowth(
    metrics.monthlySeries,
    INITIAL_DEALERSHIP_STATE,
    'baseline'
  );
  const bullish = calculateProjectedMonthlyGrowth(
    metrics.monthlySeries,
    INITIAL_DEALERSHIP_STATE,
    'bullish'
  );
  const conservative = calculateProjectedMonthlyGrowth(
    metrics.monthlySeries,
    INITIAL_DEALERSHIP_STATE,
    'conservative'
  );

  // Every historical point has projectedGrowthRevenue populated
  baseline.enrichedHistoricalSeries.forEach((pt) => {
    assert.ok(typeof pt.projectedGrowthRevenue === 'number');
    assert.ok((pt.projectedGrowthRevenue || 0) > 0);
  });

  // Forecast point is Dec (Proj.) 2026-12
  const decForecast = baseline.seriesWithNextMonthForecast[6];
  assert.equal(decForecast.monthKey, '2026-12');
  assert.equal(decForecast.isProjected, true);
  assert.ok((decForecast.projectedGrowthRevenue || 0) > 25000);
  assert.ok(
    bullish.summary.projectedRevenue >
      baseline.summary.projectedRevenue
  );
  assert.ok(
    baseline.summary.projectedRevenue >
      conservative.summary.projectedRevenue
  );
});

test('searchGlobalCommandPalette indexes inventory, CRM clients, and treasury records with category filtering and RBAC awareness', () => {
  const allUnmasked = searchGlobalCommandPalette(
    INITIAL_DEALERSHIP_STATE,
    '',
    'all',
    true
  );
  assert.ok(allUnmasked.some((r) => r.category === 'inventory'));
  assert.ok(allUnmasked.some((r) => r.category === 'clients'));
  assert.ok(allUnmasked.some((r) => r.category === 'treasury'));

  // Search specific vehicle by stock ID
  const stockHits = searchGlobalCommandPalette(
    INITIAL_DEALERSHIP_STATE,
    'CDT-102',
    'all',
    true
  );
  assert.ok(stockHits.length >= 1);
  assert.equal(stockHits[0].category, 'inventory');
  assert.ok(stockHits[0].title.includes('BMW'));

  // Search specific client by stage/name
  const clientHits = searchGlobalCommandPalette(
    INITIAL_DEALERSHIP_STATE,
    'Negotiation',
    'clients',
    true
  );
  assert.ok(clientHits.length >= 1);
  assert.ok(clientHits.every((r) => r.category === 'clients'));

  // When RBAC sensitive visibility is false, treasury records are excluded
  const maskedResults = searchGlobalCommandPalette(
    INITIAL_DEALERSHIP_STATE,
    '',
    'all',
    false
  );
  assert.ok(maskedResults.every((r) => r.category !== 'treasury'));
});




