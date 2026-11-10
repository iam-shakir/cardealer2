import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  Car,
  Check,
  CheckCircle2,
  CornerDownLeft,
  ExternalLink,
  Landmark,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useDealership } from '../context/DealershipContext';
import {
  AccountType,
  CrmStage,
  ExpenseCategory,
  ExpenseType,
  PaymentMethod,
  RoleType,
  VehicleStatus,
} from '../types';
import {
  calculateVehicleNetProfit,
  calculateVehicleTotalCost,
  CommandPaletteCategory,
  parseSmartPasteVehicleText,
  searchGlobalCommandPalette,
} from '../utils/accounting';
import { decodeVinNumber, sanitizeVin, VinDecodeResult } from '../utils/vinDecoder';

const COLOR_SWATCHES = [
  { name: 'White', hex: '#f8fafc' },
  { name: 'Black', hex: '#18181b' },
  { name: 'Silver', hex: '#94a3b8' },
  { name: 'Gray', hex: '#475569' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Green', hex: '#15803d' },
  { name: 'Gold', hex: '#ca8a04' },
  { name: 'Orange', hex: '#f17832' },
];

const MAKE_CHIPS = [
  'Toyota',
  'Honda',
  'BMW',
  'Mercedes-Benz',
  'Ford',
  'Hyundai',
  'Kia',
  'Lexus',
  'Audi',
];

const YEAR_CHIPS = [2026, 2025, 2024, 2023, 2022, 2021, 2020];

export const WorkspaceModals: React.FC = () => {
  const {
    state,
    activeModal,
    modalPayload,
    closeModal,
    addVehicle,
    addExpense,
    recordSale,
    addClient,
    addPartStock,
    allocatePartToVehicle,
    recordPartSale,
    addAccount,
    addManualTransaction,
    addDebt,
    settleDebt,
    addIdea,
    inviteTeamMember,
    fmtMoney,
    isSensitiveVisible,
    setActiveRoute,
    setSelectedVehicleId,
    jumpToCommandPaletteResult,
    showToast,
  } = useDealership();

  // 1. Add Vehicle Modal State
  const [smartPasteInput, setSmartPasteInput] = useState('');
  const [showSmartPasteBox, setShowSmartPasteBox] = useState(false);
  const [vVin, setVVin] = useState('1HGCV1F34LA098765');
  const [vStockId, setVStockId] = useState(
    `CDT-${101 + state.vehicles.length}`
  );
  const [vYear, setVYear] = useState(2022);
  const [vMake, setVMake] = useState('Toyota');
  const [vModel, setVModel] = useState('Camry');
  const [vTrim, setVTrim] = useState('SE Nightshade');
  const [vColor, setVColor] = useState('White');
  const [vColorHex, setVColorHex] = useState('#f8fafc');
  const [vEngine, setVEngine] = useState('2.5L Dynamic Force I4');
  const [vDrivetrain, setVDrivetrain] = useState('FWD');
  const [vMileage, setVMileage] = useState(31500);
  const [vPurchasePrice, setVPurchasePrice] = useState(18200);
  const [vAskingPrice, setVAskingPrice] = useState(22900);
  const [vRetailValue, setVRetailValue] = useState(23500);
  const [vWholesaleValue, setVWholesaleValue] = useState(19000);
  const [vPurchaseDate, setVPurchaseDate] = useState('2026-11-09');
  const [vStatus, setVStatus] = useState<VehicleStatus>('Available');
  const [vPaidFrom, setVPaidFrom] = useState(
    state.accounts[0]?.id || 'acc-bank'
  );
  const [vCoverPhoto, setVCoverPhoto] = useState(
    '/src/assets/images/car_honda_accord_1794267358981.jpg'
  );
  const [vNotes, setVNotes] = useState('');

  // 2. Add Expense Modal State
  const [eAmount, setEAmount] = useState(220);
  const [eDate, setEDate] = useState('2026-11-09');
  const [eCategory, setECategory] = useState<ExpenseCategory>('Repairs');
  const [eType, setEType] = useState<ExpenseType>(
    modalPayload.vehicleId ? 'Vehicle-linked' : 'Vehicle-linked'
  );
  const [eVehicleId, setEVehicleId] = useState(
    modalPayload.vehicleId || state.vehicles[0]?.id || ''
  );
  const [eMember, setEMember] = useState(state.settings.displayName);
  const [ePaidFrom, setEPaidFrom] = useState(
    state.accounts[0]?.id || 'acc-bank'
  );
  const [eDesc, setEDesc] = useState('');
  const [eReceipt, setEReceipt] = useState('');

  // 3. Record Sale Modal State
  const unsoldVehicles = state.vehicles.filter((v) => v.status !== 'Sold');
  const [sVehicleId, setSVehicleId] = useState(
    modalPayload.vehicleId || unsoldVehicles[0]?.id || ''
  );
  const [sAmount, setSAmount] = useState(21900);
  const [sDate, setSDate] = useState('2026-11-09');
  const [sVatPct, setSVatPct] = useState(0);
  const [sBuyerName, setSBuyerName] = useState('');
  const [sBuyerPhone, setSBuyerPhone] = useState('+1 (512) 555-0144');
  const [sPaymentMethod, setSPaymentMethod] =
    useState<PaymentMethod>('Bank Transfer');
  const [sDepositTo, setSDepositTo] = useState(
    state.accounts[0]?.id || 'acc-bank'
  );
  const [sNotes, setSNotes] = useState('');

  // 4. Add Client Modal State
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('+1 (512) 555-0188');
  const [cEmail, setCEmail] = useState('');
  const [cStage, setCStage] = useState<CrmStage>('New lead');
  const [cVehicleId, setCVehicleId] = useState(unsoldVehicles[0]?.id || '');
  const [cContactDate, setCContactDate] = useState('2026-11-12');
  const [cRequest, setCRequest] = useState('');
  const [cNotes, setCNotes] = useState('');

  // 5. Add Part Stock Modal State
  const [pMode, setPMode] = useState<'existing' | 'new'>('existing');
  const [pExistingId, setPExistingId] = useState(state.parts[0]?.id || '');
  const [pName, setPName] = useState('');
  const [pCode, setPCode] = useState('PRT-NEW-01');
  const [pCategory, setPCategory] = useState('Brakes & Suspension');
  const [pBatchLabel, setPBatchLabel] = useState('Batch #NOV-09');
  const [pQty, setPQty] = useState(6);
  const [pUnitCost, setPUnitCost] = useState(48);
  const [pDate, setPDate] = useState('2026-11-09');
  const [pPaidFrom, setPPaidFrom] = useState(
    state.accounts[0]?.id || 'acc-bank'
  );

  // 6. Record Part Sale / Allocate Part State
  const [psPartId, setPsPartId] = useState(state.parts[0]?.id || '');
  const [psQty, setPsQty] = useState(1);
  const [psUnitPrice, setPsUnitPrice] = useState(95);
  const [psBuyer, setPsBuyer] = useState('Walk-In Shop Customer');
  const [psPhone, setPsPhone] = useState('+1 (512) 555-0199');
  const [psVehicleId, setPsVehicleId] = useState(unsoldVehicles[0]?.id || '');

  // 7, 8, 9. Finance Modals State
  const [accType, setAccType] = useState<AccountType>('Bank');
  const [accName, setAccName] = useState('');
  const [accStartBal, setAccStartBal] = useState(10000);

  const [txAccId, setTxAccId] = useState(state.accounts[0]?.id || 'acc-bank');
  const [txType, setTxType] = useState<'Deposit' | 'Withdrawal'>('Deposit');
  const [txAmount, setTxAmount] = useState(1500);
  const [txDate, setTxDate] = useState('2026-11-09T14:00');
  const [txNote, setTxNote] = useState('');

  const [dCounterparty, setDCounterparty] = useState('');
  const [dDirection, setDDirection] = useState<'Owed to me' | 'I owe'>(
    'Owed to me'
  );
  const [dAmount, setDAmount] = useState(1800);
  const [dDate, setDDate] = useState('2026-11-09');
  const [dDueDate, setDDueDate] = useState('2026-11-24');
  const [dPhone, setDPhone] = useState('+1 (512) 555-0177');
  const [dNotes, setDNotes] = useState('');
  const [settleAmt, setSettleAmt] = useState(500);

  // 10 & 11. Idea & Invite Member State
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDetails, setIdeaDetails] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleType>('Sales');

  // Deal Desk Simulator State
  const [ddSalePrice, setDdSalePrice] = useState(21900);
  const [ddPurchaseCost, setDdPurchaseCost] = useState(16500);
  const [ddReconCost, setDdReconCost] = useState(450);
  const [ddTradeAllowance, setDdTradeAllowance] = useState(4000);
  const [ddTradeActualAcv, setDdTradeActualAcv] = useState(4500);
  const [ddDocFee, setDdDocFee] = useState(299);
  const [ddCommissionPct, setDdCommissionPct] = useState(15);

  // Window Sticker Warranty State
  const [warrantyType, setWarrantyType] = useState<'as_is' | 'warranty'>(
    'warranty'
  );

  // Automatic VIN Decoding State
  const [isDecodingVin, setIsDecodingVin] = useState(false);
  const [vinDecodeResult, setVinDecodeResult] = useState<VinDecodeResult | null>(null);

  const handleTriggerVinDecode = async (vinToDecode?: string) => {
    const vinText = vinToDecode || vVin;
    if (!vinText || vinText.length < 10) return;
    setIsDecodingVin(true);
    try {
      const res = await decodeVinNumber(vinText);
      setVinDecodeResult(res);
      if (res.isValid) {
        if (res.year) setVYear(res.year);
        if (res.make) setVMake(res.make);
        if (res.model) setVModel(res.model);
        if (res.trim) setVTrim(res.trim);
        if (res.engine) setVEngine(res.engine);
        if (res.drivetrain) setVDrivetrain(res.drivetrain);
        showToast(
          `VIN Decoded: ${res.year || ''} ${res.make || ''} ${res.model || ''} (${
            res.rawSource === 'nhtsa' ? 'Official NHTSA Registry' : 'Local WMI'
          })`
        );
      } else if (res.error) {
        showToast(`VIN Decode: ${res.error}`);
      }
    } catch (_err) {
      showToast('VIN Decode unavailable or invalid format.');
    } finally {
      setIsDecodingVin(false);
    }
  };

  // Command Search State
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdCategory, setCmdCategory] =
    useState<CommandPaletteCategory>('all');
  const [cmdActiveIndex, setCmdActiveIndex] = useState(0);

  const cmdAllResults = useMemo(
    () =>
      searchGlobalCommandPalette(
        state,
        cmdQuery,
        'all',
        isSensitiveVisible
      ),
    [state, cmdQuery, isSensitiveVisible]
  );

  const cmdFilteredResults = useMemo(
    () =>
      cmdCategory === 'all'
        ? cmdAllResults
        : cmdAllResults.filter((item) => item.category === cmdCategory),
    [cmdAllResults, cmdCategory]
  );

  const cmdCategoryCounts = useMemo(() => {
    return {
      all: cmdAllResults.length,
      inventory: cmdAllResults.filter((r) => r.category === 'inventory').length,
      clients: cmdAllResults.filter((r) => r.category === 'clients').length,
      treasury: cmdAllResults.filter((r) => r.category === 'treasury').length,
    };
  }, [cmdAllResults]);

  useEffect(() => {
    setCmdActiveIndex(0);
  }, [cmdQuery, cmdCategory, activeModal]);

  // Synchronize context-sensitive defaults whenever a modal opens
  useEffect(() => {
    if (!activeModal) return;
    if (activeModal === 'add_vehicle') {
      setVStockId(`CDT-${101 + state.vehicles.length}`);
    } else if (activeModal === 'add_expense') {
      if (modalPayload.vehicleId) {
        setEType('Vehicle-linked');
        setEVehicleId(modalPayload.vehicleId);
      }
    } else if (activeModal === 'record_sale') {
      const targetId =
        modalPayload.vehicleId ||
        state.vehicles.find((v) => v.status !== 'Sold')?.id ||
        '';
      setSVehicleId(targetId);
      const targetVeh = state.vehicles.find((v) => v.id === targetId);
      if (targetVeh) {
        setSAmount(targetVeh.askingPrice);
      }
    } else if (activeModal === 'settle_debt' && modalPayload.debtId) {
      const d = state.debts.find((item) => item.id === modalPayload.debtId);
      if (d) {
        setSettleAmt(d.amount - d.paidAmount);
      }
    }
  }, [activeModal, modalPayload, state.vehicles, state.debts]);

  if (!activeModal) return null;

  const handleSmartPasteParse = async () => {
    if (!smartPasteInput.trim()) return;
    try {
      const res = await fetch('/api/ai/smart-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: smartPasteInput }),
      });
      const data = await res.json();
      const spec = data.spec || parseSmartPasteVehicleText(smartPasteInput);
      if (spec.year) setVYear(spec.year);
      if (spec.make) setVMake(spec.make);
      if (spec.model) setVModel(spec.model);
      if (spec.trim) setVTrim(spec.trim);
      if (spec.vin) setVVin(spec.vin);
      if (spec.mileage) setVMileage(spec.mileage);
      if (spec.purchasePrice) setVPurchasePrice(spec.purchasePrice);
      if (spec.askingPrice) setVAskingPrice(spec.askingPrice);
      if (spec.engine) setVEngine(spec.engine);
      if (spec.drivetrain) setVDrivetrain(spec.drivetrain);
      if (spec.color) setVColor(spec.color);
      if (spec.notes) setVNotes(spec.notes);
      setShowSmartPasteBox(false);
    } catch (_e) {
      const spec = parseSmartPasteVehicleText(smartPasteInput);
      if (spec.year) setVYear(spec.year);
      if (spec.make) setVMake(spec.make);
      if (spec.model) setVModel(spec.model);
      if (spec.vin) setVVin(spec.vin);
      if (spec.purchasePrice) setVPurchasePrice(spec.purchasePrice);
      if (spec.askingPrice) setVAskingPrice(spec.askingPrice);
      setShowSmartPasteBox(false);
    }
  };

  const targetStickerVehicle =
    state.vehicles.find((v) => v.id === modalPayload.vehicleId) ||
    state.vehicles[0];

  const targetDebt = state.debts.find((d) => d.id === modalPayload.debtId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* 1. ADD VEHICLE MODAL */}
        {activeModal === 'add_vehicle' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addVehicle({
                stockId: vStockId,
                vin: vVin,
                year: vYear,
                make: vMake,
                model: vModel,
                trim: vTrim,
                color: vColor,
                colorHex: vColorHex,
                engine: vEngine,
                drivetrain: vDrivetrain,
                mileage: vMileage,
                purchasePrice: vPurchasePrice,
                askingPrice: vAskingPrice,
                retailValue: vRetailValue,
                wholesaleValue: vWholesaleValue,
                purchaseDate: vPurchaseDate,
                status: vStatus,
                paidFromAccountId: vPaidFrom,
                coverPhoto: vCoverPhoto,
                bodyFuelNotes: `${vDrivetrain} · Gasoline`,
                notes: vNotes,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-[#f17832]" />
                <span className="text-sm font-bold">Add Vehicle to Inventory</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSmartPasteBox((p) => !p)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-amber-400 flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>✨ Smart Paste</span>
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4 text-zinc-400 hover:text-white" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {showSmartPasteBox && (
                <div className="p-3 rounded-lg bg-orange-50/70 border border-[#f17832] space-y-2">
                  <div className="font-bold text-slate-900">
                    Paste Unstructured Car Listing or Auction Spec Text
                  </div>
                  <textarea
                    rows={2}
                    value={smartPasteInput}
                    onChange={(e) => setSmartPasteInput(e.target.value)}
                    placeholder="e.g. 2021 BMW 330i M Sport AWD VIN 5TDKZ3DC8LS054321 with 34,200 miles in Blue, bought for $24,000 asking $29,500"
                    className="w-full p-2 rounded border border-slate-300 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSmartPasteParse}
                    style={{ backgroundColor: state.settings.accentColor }}
                    className="px-3 py-1.5 rounded text-white font-semibold"
                  >
                    Parse &amp; Auto-Fill Fields
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-slate-700">
                      17-Character VIN
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleTriggerVinDecode()}
                      disabled={isDecodingVin || vVin.length < 10}
                      className="text-[11px] font-semibold text-[#f17832] hover:underline flex items-center gap-1 disabled:opacity-40"
                    >
                      {isDecodingVin ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin text-[#f17832]" />
                          <span>Decoding VIN...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3 text-[#f17832]" />
                          <span>Auto-Decode VIN</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={17}
                    required
                    value={vVin}
                    onChange={(e) => {
                      const nextVin = sanitizeVin(e.target.value);
                      setVVin(nextVin);
                      if (nextVin.length === 17) {
                        void handleTriggerVinDecode(nextVin);
                      }
                    }}
                    placeholder="e.g. 1HGCV1F34LA012345"
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono tracking-wider text-slate-900 uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Stock ID
                  </label>
                  <input
                    type="text"
                    required
                    value={vStockId}
                    onChange={(e) => setVStockId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* VIN Decode Success Feedback Callout Banner */}
              {vinDecodeResult && vinDecodeResult.isValid && (
                <div className="p-3 rounded-lg bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-emerald-950 truncate">
                        Decoded {vinDecodeResult.year} {vinDecodeResult.make} {vinDecodeResult.model} {vinDecodeResult.trim}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-mono truncate">
                        {vinDecodeResult.engine} · {vinDecodeResult.drivetrain} · Source: {vinDecodeResult.rawSource === 'nhtsa' ? 'Official NHTSA Registry' : 'Local WMI'}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold shrink-0 border border-emerald-200">
                    Fields Auto-Filled
                  </span>
                </div>
              )}

              {/* Year steppers + quick chips */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Model Year
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setVYear((y) => y - 1)}
                    className="px-2.5 py-1 rounded border border-slate-300 font-mono font-bold"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={vYear}
                    onChange={(e) => setVYear(Number(e.target.value))}
                    className="w-20 px-2 py-1 text-center rounded border border-slate-200 font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setVYear((y) => y + 1)}
                    className="px-2.5 py-1 rounded border border-slate-300 font-mono font-bold"
                  >
                    +
                  </button>
                  {YEAR_CHIPS.map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setVYear(yr)}
                      className={`px-2 py-1 rounded text-[11px] font-mono ${
                        vYear === yr
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Make + Quick Chips */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Make
                </label>
                <input
                  type="text"
                  required
                  value={vMake}
                  onChange={(e) => setVMake(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 mb-1.5"
                />
                <div className="flex flex-wrap gap-1">
                  {MAKE_CHIPS.map((mk) => (
                    <button
                      key={mk}
                      type="button"
                      onClick={() => setVMake(mk)}
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        vMake === mk
                          ? 'bg-[#f17832] text-white font-semibold'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {mk}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    required
                    value={vModel}
                    onChange={(e) => setVModel(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Trim
                  </label>
                  <input
                    type="text"
                    value={vTrim}
                    onChange={(e) => setVTrim(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200"
                  />
                </div>
              </div>

              {/* 9 Exterior Color Swatches */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Exterior Color ({vColor})
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw.name}
                      type="button"
                      onClick={() => {
                        setVColor(sw.name);
                        setVColorHex(sw.hex);
                      }}
                      className={`px-2.5 py-1 rounded border flex items-center gap-1.5 ${
                        vColor === sw.name
                          ? 'border-[#f17832] bg-orange-50 font-semibold'
                          : 'border-slate-200'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-slate-300"
                        style={{ backgroundColor: sw.hex }}
                      />
                      <span>{sw.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Engine
                  </label>
                  <input
                    type="text"
                    value={vEngine}
                    onChange={(e) => setVEngine(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Drivetrain
                  </label>
                  <input
                    type="text"
                    value={vDrivetrain}
                    onChange={(e) => setVDrivetrain(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Mileage
                  </label>
                  <input
                    type="number"
                    value={vMileage}
                    onChange={(e) => setVMileage(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Purchase Price ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={vPurchasePrice}
                    onChange={(e) => setVPurchasePrice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Asking Price ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={vAskingPrice}
                    onChange={(e) => setVAskingPrice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Retail Value ($)
                  </label>
                  <input
                    type="number"
                    value={vRetailValue}
                    onChange={(e) => setVRetailValue(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Wholesale Value ($)
                  </label>
                  <input
                    type="number"
                    value={vWholesaleValue}
                    onChange={(e) => setVWholesaleValue(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    value={vPurchaseDate}
                    onChange={(e) => setVPurchaseDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={vStatus}
                    onChange={(e) => setVStatus(e.target.value as VehicleStatus)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-white"
                  >
                    {(['Owned', 'In transit', 'In prep', 'Available', 'Reserved'] as VehicleStatus[]).map(
                      (s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Paid From Account
                  </label>
                  <select
                    value={vPaidFrom}
                    onChange={(e) => setVPaidFrom(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-white"
                  >
                    {state.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({fmtMoney(acc.balance, true)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Save Vehicle &amp; Log Outflow
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 2. ADD EXPENSE MODAL */}
        {activeModal === 'add_expense' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addExpense({
                amount: eAmount,
                date: eDate,
                category: eCategory,
                type: eType,
                vehicleId: eType === 'Vehicle-linked' ? eVehicleId : undefined,
                teamMember: eMember,
                paidFromAccountId: ePaidFrom,
                description:
                  eDesc.trim() || `${eCategory} expense logged on ${eDate}`,
                receiptUrl: eReceipt || undefined,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">Log Dealership Expense</span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={eAmount}
                    onChange={(e) => setEAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={eDate}
                    onChange={(e) => setEDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={eCategory}
                    onChange={(e) =>
                      setECategory(e.target.value as ExpenseCategory)
                    }
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {[
                      'Repairs',
                      'Detailing',
                      'Transport',
                      'Registration',
                      'Parts',
                      'Office',
                      'Rent',
                      'Marketing',
                    ].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Expense Type
                  </label>
                  <select
                    value={eType}
                    onChange={(e) => setEType(e.target.value as ExpenseType)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    <option value="Vehicle-linked">
                      Vehicle-linked (Capitalized Recon)
                    </option>
                    <option value="General Overhead">General Overhead</option>
                  </select>
                </div>
                {eType === 'Vehicle-linked' && (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Target Vehicle
                    </label>
                    <select
                      value={eVehicleId}
                      onChange={(e) => setEVehicleId(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                    >
                      {state.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.stockId} — {v.year} {v.make} {v.model}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Paid From Account
                  </label>
                  <select
                    value={ePaidFrom}
                    onChange={(e) => setEPaidFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {state.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({fmtMoney(acc.balance, true)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Team Member
                  </label>
                  <input
                    type="text"
                    value={eMember}
                    onChange={(e) => setEMember(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    value={eDesc}
                    onChange={(e) => setEDesc(e.target.value)}
                    placeholder="e.g. Ceramic brake pad swap & rotor resurfacing"
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Receipt Photo / Reference
                  </label>
                  <input
                    type="text"
                    value={eReceipt}
                    onChange={(e) => setEReceipt(e.target.value)}
                    placeholder="e.g. receipt_invoice_094.pdf"
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Save Expense
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 3. RECORD SALE MODAL */}
        {activeModal === 'record_sale' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!sVehicleId) return;
              const vatAmt = Math.round((sAmount * sVatPct) / 100);
              recordSale({
                vehicleId: sVehicleId,
                saleAmount: sAmount,
                saleDate: sDate,
                vatRefundPct: sVatPct,
                vatRefundAmount: vatAmt,
                buyerName: sBuyerName.trim() || 'Retail Customer',
                buyerPhone: sBuyerPhone,
                paymentMethod: sPaymentMethod,
                depositToAccountId: sDepositTo,
                notes: sNotes,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">Record Vehicle Sale</span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Unsold Vehicle
                  </label>
                  <select
                    value={sVehicleId}
                    onChange={(e) => setSVehicleId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {unsoldVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.stockId} — {v.year} {v.make} {v.model} (Asking{' '}
                        {fmtMoney(v.askingPrice)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Sale Amount ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={sAmount}
                    onChange={(e) => setSAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Sale Date
                  </label>
                  <input
                    type="date"
                    value={sDate}
                    onChange={(e) => setSDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Buyer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={sBuyerName}
                    onChange={(e) => setSBuyerName(e.target.value)}
                    placeholder="Full Buyer Name"
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Buyer Phone
                  </label>
                  <input
                    type="text"
                    value={sBuyerPhone}
                    onChange={(e) => setSBuyerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={sPaymentMethod}
                    onChange={(e) =>
                      setSPaymentMethod(e.target.value as PaymentMethod)
                    }
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {[
                      'Cash',
                      'Bank Transfer',
                      'Card',
                      'Financed / Partial Receivable',
                    ].map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Deposit Proceeds To
                  </label>
                  <select
                    value={sDepositTo}
                    onChange={(e) => setSDepositTo(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {state.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    VAT Refund %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={sVatPct}
                    onChange={(e) => setSVatPct(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Complete Sale &amp; Deposit Funds
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 4. ADD CLIENT MODAL */}
        {activeModal === 'add_client' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addClient({
                name: cName,
                phone: cPhone,
                email: cEmail,
                stage: cStage,
                vehicleId: cVehicleId || undefined,
                preferredContactDate: cContactDate,
                isOverdue: false,
                request: cRequest || 'Interested in current inventory',
                notes: cNotes,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">Add CRM Buyer Lead</span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Client Name
                  </label>
                  <input
                    type="text"
                    required
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="e.g. David Thorne"
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    required
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={cEmail}
                    onChange={(e) => setCEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pipeline Stage
                  </label>
                  <select
                    value={cStage}
                    onChange={(e) => setCStage(e.target.value as CrmStage)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {[
                      'New lead',
                      'Contacted',
                      'Viewing',
                      'Negotiation',
                      'Sold',
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Vehicle of Interest
                  </label>
                  <select
                    value={cVehicleId}
                    onChange={(e) => setCVehicleId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    <option value="">General Inquiry</option>
                    {state.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.stockId} — {v.year} {v.make} {v.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Preferred Contact Date
                  </label>
                  <input
                    type="date"
                    value={cContactDate}
                    onChange={(e) => setCContactDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Buyer Request &amp; Notes
                </label>
                <input
                  type="text"
                  value={cRequest}
                  onChange={(e) => setCRequest(e.target.value)}
                  placeholder="Looking for sedan under $25k, trade-in ready..."
                  className="w-full px-3 py-2 rounded border border-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Save Client Lead
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 5. ADD PART STOCK MODAL (FIFO) */}
        {activeModal === 'add_part_stock' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const existingPart = state.parts.find(
                (p) => p.id === pExistingId
              );
              addPartStock({
                existingPartId: pMode === 'existing' ? pExistingId : undefined,
                name:
                  pMode === 'existing'
                    ? existingPart?.name || 'Part'
                    : pName || 'OEM Replacement Part',
                code: pMode === 'existing' ? existingPart?.code || '' : pCode,
                category:
                  pMode === 'existing'
                    ? existingPart?.category || ''
                    : pCategory,
                batchLabel: pBatchLabel,
                quantity: pQty,
                unitCost: pUnitCost,
                purchaseDate: pDate,
                paidFromAccountId: pPaidFrom,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">
                Add FIFO Part Stock Batch
              </span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPMode('existing')}
                  className={`px-3 py-1.5 rounded font-semibold ${
                    pMode === 'existing'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Existing Part SKU
                </button>
                <button
                  type="button"
                  onClick={() => setPMode('new')}
                  className={`px-3 py-1.5 rounded font-semibold ${
                    pMode === 'new'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Create New Part SKU
                </button>
              </div>

              {pMode === 'existing' ? (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Select Existing Part
                  </label>
                  <select
                    value={pExistingId}
                    onChange={(e) => setPExistingId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {state.parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Part Name
                    </label>
                    <input
                      type="text"
                      required
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Code / SKU
                    </label>
                    <input
                      type="text"
                      required
                      value={pCode}
                      onChange={(e) => setPCode(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={pCategory}
                      onChange={(e) => setPCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-200"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Batch Label
                  </label>
                  <input
                    type="text"
                    value={pBatchLabel}
                    onChange={(e) => setPBatchLabel(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={pQty}
                    onChange={(e) => setPQty(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Unit Cost ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={pUnitCost}
                    onChange={(e) => setPUnitCost(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    value={pDate}
                    onChange={(e) => setPDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Paid From Account
                </label>
                <select
                  value={pPaidFrom}
                  onChange={(e) => setPPaidFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                >
                  {state.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Add FIFO Batch
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 6. RECORD PART SALE OR ALLOCATE PART TO VEHICLE */}
        {(activeModal === 'record_part_sale' ||
          activeModal === 'allocate_part') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (activeModal === 'allocate_part') {
                allocatePartToVehicle({
                  partId: psPartId,
                  vehicleId: psVehicleId,
                  quantity: psQty,
                });
              } else {
                recordPartSale({
                  partId: psPartId,
                  quantity: psQty,
                  unitPrice: psUnitPrice,
                  saleDate: '2026-11-09',
                  buyer: psBuyer,
                  phone: psPhone,
                  paymentMethod: 'Card',
                  depositToAccountId: state.accounts[0]?.id || 'acc-bank',
                });
              }
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">
                {activeModal === 'allocate_part'
                  ? 'Allocate FIFO Part to Vehicle Recon'
                  : 'Record Counter Part Sale (FIFO)'}
              </span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Select Part (Deducts Oldest Batch First)
                  </label>
                  <select
                    value={psPartId}
                    onChange={(e) => setPsPartId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {state.parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={psQty}
                    onChange={(e) => setPsQty(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>

              {activeModal === 'allocate_part' ? (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Target Vehicle (Logs Recon Expense at FIFO Cost)
                  </label>
                  <select
                    value={psVehicleId}
                    onChange={(e) => setPsVehicleId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {unsoldVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.stockId} — {v.year} {v.make} {v.model}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Retail Unit Price ($)
                    </label>
                    <input
                      type="number"
                      value={psUnitPrice}
                      onChange={(e) => setPsUnitPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Buyer Name
                    </label>
                    <input
                      type="text"
                      value={psBuyer}
                      onChange={(e) => setPsBuyer(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-200"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  {activeModal === 'allocate_part'
                    ? 'Allocate FIFO Part'
                    : 'Complete Part Sale'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 7. ADD FINANCIAL ACCOUNT MODAL */}
        {activeModal === 'add_account' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addAccount({
                name: accName || 'New Operating Account',
                type: accType,
                startingBalance: accStartBal,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">Add Financial Account</span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Account Type
                  </label>
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as AccountType)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {(['Bank', 'Cash', 'Card', 'Other'] as AccountType[]).map(
                      (t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Account Name
                  </label>
                  <input
                    type="text"
                    required
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                    placeholder="e.g. Chase Floorplan Checking"
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Starting Balance ($)
                  </label>
                  <input
                    type="number"
                    value={accStartBal}
                    onChange={(e) => setAccStartBal(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Create Account
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 8. ADD TRANSACTION MODAL */}
        {activeModal === 'add_transaction' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addManualTransaction({
                accountId: txAccId,
                type: txType,
                amount: txAmount,
                date: txDate,
                note: txNote,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">Record Treasury Transaction</span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Account
                  </label>
                  <select
                    value={txAccId}
                    onChange={(e) => setTxAccId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {state.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Type
                  </label>
                  <select
                    value={txType}
                    onChange={(e) =>
                      setTxType(e.target.value as 'Deposit' | 'Withdrawal')
                    }
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    <option value="Deposit">Deposit (+ Inflow)</option>
                    <option value="Withdrawal">Withdrawal (- Outflow)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={txAmount}
                    onChange={(e) => setTxAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Note
                </label>
                <input
                  type="text"
                  required
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  placeholder="Capital injection or owner draw note"
                  className="w-full px-3 py-2 rounded border border-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Save Transaction
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 9. ADD BALANCE (DEBT) OR SETTLE DEBT MODAL */}
        {activeModal === 'add_debt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addDebt({
                counterparty: dCounterparty,
                direction: dDirection,
                amount: dAmount,
                date: dDate,
                dueDate: dDueDate,
                phone: dPhone,
                notes: dNotes,
              });
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">
                Add Counterparty Balance (Receivable / Payable)
              </span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Counterparty
                  </label>
                  <input
                    type="text"
                    required
                    value={dCounterparty}
                    onChange={(e) => setDCounterparty(e.target.value)}
                    placeholder="Buyer or Vendor Name"
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Direction
                  </label>
                  <select
                    value={dDirection}
                    onChange={(e) => setDDirection(e.target.value as any)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    <option value="Owed to me">Owed to me (Receivable)</option>
                    <option value="I owe">I owe (Payable)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={dAmount}
                    onChange={(e) => setDAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dDueDate}
                    onChange={(e) => setDDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={dNotes}
                    onChange={(e) => setDNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Save Balance
                </button>
              </div>
            </div>
          </form>
        )}

        {activeModal === 'settle_debt' && targetDebt && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              settleDebt(targetDebt.id, settleAmt, txAccId);
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">
                Record Settlement — {targetDebt.counterparty}
              </span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Remaining Balance:{' '}
                <strong className="font-mono text-slate-900">
                  {fmtMoney(targetDebt.amount - targetDebt.paidAmount, true)}
                </strong>{' '}
                ({targetDebt.direction})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Settlement Amount ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={targetDebt.amount - targetDebt.paidAmount}
                    value={settleAmt}
                    onChange={(e) => setSettleAmt(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Treasury Account
                  </label>
                  <select
                    value={txAccId}
                    onChange={(e) => setTxAccId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {state.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Apply Settlement &amp; Update Account
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 10. NEW IDEA MODAL */}
        {activeModal === 'new_idea' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addIdea(ideaTitle, ideaDetails);
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">Submit Product Idea</span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Short Title (max 120 chars)
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Details (max 1200 chars)
                </label>
                <textarea
                  rows={4}
                  required
                  maxLength={1200}
                  value={ideaDetails}
                  onChange={(e) => setIdeaDetails(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Submit Idea
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 11. INVITE TEAM MEMBER MODAL */}
        {activeModal === 'invite_member' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              inviteTeamMember(inviteEmail, inviteRole);
              closeModal();
            }}
          >
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">Invite Dealership Team Member</span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@apexautolot.com"
                    className="w-full px-3 py-2 rounded border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Role Preset
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as RoleType)}
                    className="w-full px-3 py-2 rounded border border-slate-200 bg-white"
                  >
                    {(['Owner', 'Admin', 'Sales', 'Viewer'] as RoleType[]).map(
                      (r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold"
                >
                  Send Invitation
                </button>
              </div>
            </div>
          </form>
        )}

        {/* DEAL DESK SIMULATOR MODAL */}
        {activeModal === 'deal_desk' && (
          <div className="text-xs">
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#f17832]" />
                <span className="text-sm font-bold">
                  Interactive Deal Desk Margin Simulator
                </span>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Negotiated Sale Price
                  </label>
                  <input
                    type="number"
                    value={ddSalePrice}
                    onChange={(e) => setDdSalePrice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Vehicle Purchase Cost
                  </label>
                  <input
                    type="number"
                    value={ddPurchaseCost}
                    onChange={(e) => setDdPurchaseCost(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Recon &amp; Detail Costs
                  </label>
                  <input
                    type="number"
                    value={ddReconCost}
                    onChange={(e) => setDdReconCost(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Trade-In Allowance Given
                  </label>
                  <input
                    type="number"
                    value={ddTradeAllowance}
                    onChange={(e) => setDdTradeAllowance(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Trade-In Actual Cash Value (ACV)
                  </label>
                  <input
                    type="number"
                    value={ddTradeActualAcv}
                    onChange={(e) => setDdTradeActualAcv(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Doc Fee ($299) &amp; Comm (%)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={ddDocFee}
                      onChange={(e) => setDdDocFee(Number(e.target.value))}
                      className="w-1/2 px-2 py-1.5 rounded border border-slate-200 font-mono"
                    />
                    <input
                      type="number"
                      value={ddCommissionPct}
                      onChange={(e) => setDdCommissionPct(Number(e.target.value))}
                      className="w-1/2 px-2 py-1.5 rounded border border-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>

              {(() => {
                const tradeDelta = ddTradeActualAcv - ddTradeAllowance;
                const frontGross =
                  ddSalePrice + ddDocFee - (ddPurchaseCost + ddReconCost) + tradeDelta;
                const repCommission = Math.max(
                  0,
                  Math.round((frontGross * ddCommissionPct) / 100)
                );
                const netHouseProfit = frontGross - repCommission;
                return (
                  <div className="p-4 rounded-lg bg-slate-900 text-white grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 font-mono tabular-nums">
                    <div>
                      <div className="text-[10px] text-zinc-400 font-sans">
                        Front-End Gross
                      </div>
                      <div className="text-base font-bold">
                        {fmtMoney(frontGross)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-400 font-sans">
                        Sales Commission ({ddCommissionPct}%)
                      </div>
                      <div className="text-base font-bold text-amber-400">
                        {fmtMoney(repCommission)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-400 font-sans">
                        Net House Profit
                      </div>
                      <div className="text-base font-bold text-emerald-400">
                        {fmtMoney(netHouseProfit)}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* FTC WINDOW STICKER & BUYER'S GUIDE MODAL */}
        {activeModal === 'window_sticker' && targetStickerVehicle && (
          <div className="text-xs">
            <div className="px-4 sm:px-5 py-3.5 bg-[#18181b] text-white flex flex-wrap items-center justify-between gap-2 no-print">
              <span className="text-sm font-bold">
                FTC Buyer&apos;s Guide &amp; Showroom Window Sticker
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-3 py-1 rounded text-white font-semibold flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button type="button" onClick={closeModal} aria-label="Close modal">
                  <X className="w-4 h-4 text-zinc-400 hover:text-white" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-5 border-2 sm:border-4 border-slate-900 m-2 sm:m-4 rounded">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-slate-900 pb-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {state.settings.dealershipName}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
                    {targetStickerVehicle.year} {targetStickerVehicle.make}{' '}
                    {targetStickerVehicle.model} {targetStickerVehicle.trim}
                  </h2>
                  <div className="font-mono text-xs text-slate-600 mt-1">
                    VIN: {targetStickerVehicle.vin} · Stock:{' '}
                    {targetStickerVehicle.stockId} · Odometer:{' '}
                    {targetStickerVehicle.mileage.toLocaleString()} mi
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Retail Asking Price
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[#f17832]">
                    {fmtMoney(targetStickerVehicle.askingPrice)}
                  </div>
                </div>
              </div>

              {/* FTC Buyers Guide Warranty Checkboxes */}
              <div className="space-y-3 border-b border-slate-300 pb-4">
                <div className="font-bold text-sm uppercase">
                  FTC BUYERS GUIDE — WARRANTIES FOR THIS VEHICLE
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWarrantyType('as_is')}
                    className={`p-3 rounded border-2 text-left ${
                      warrantyType === 'as_is'
                        ? 'border-slate-900 bg-slate-100'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-sm">
                      {warrantyType === 'as_is' ? '☑' : '☐'} AS IS - NO DEALER
                      WARRANTY
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      The dealer does not provide a warranty for any repairs after sale.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWarrantyType('warranty')}
                    className={`p-3 rounded border-2 text-left ${
                      warrantyType === 'warranty'
                        ? 'border-slate-900 bg-slate-100'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-sm">
                      {warrantyType === 'warranty' ? '☑' : '☐'} DEALER WARRANTY
                      INCLUDED
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Limited 90-Day / 3,000-Mile Powertrain Coverage (100% Parts &amp; Labor).
                    </p>
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">
                    Engine: {targetStickerVehicle.engine} · Drivetrain:{' '}
                    {targetStickerVehicle.drivetrain} · Exterior:{' '}
                    {targetStickerVehicle.color}
                  </div>
                  <div className="text-slate-600">
                    {targetStickerVehicle.notes}
                  </div>
                </div>
                <div className="flex flex-col items-center p-2 border border-slate-300 rounded shrink-0 self-start sm:self-auto">
                  <QrCode className="w-12 h-12 text-slate-900" />
                  <span className="text-[9px] font-mono mt-1">
                    SCAN SPEC SHEET
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WHATSAPP BUYER SHARE MODAL */}
        {activeModal === 'whatsapp_share' && targetStickerVehicle && (
          <div className="text-xs">
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <span className="text-sm font-bold">
                Share Buyer Vehicle Page via WhatsApp
              </span>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="font-bold text-sm text-slate-900">
                  {targetStickerVehicle.year} {targetStickerVehicle.make}{' '}
                  {targetStickerVehicle.model} {targetStickerVehicle.trim}
                </div>
                <div className="font-mono text-slate-700">
                  Asking Price: {fmtMoney(targetStickerVehicle.askingPrice)} ·
                  Mileage: {targetStickerVehicle.mileage.toLocaleString()} mi ·
                  VIN: {targetStickerVehicle.vin}
                </div>
                <p className="text-slate-600">{targetStickerVehicle.notes}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-700"
                >
                  Close
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `*${targetStickerVehicle.year} ${targetStickerVehicle.make} ${targetStickerVehicle.model} ${targetStickerVehicle.trim}*\nPrice: ${fmtMoney(
                      targetStickerVehicle.askingPrice
                    )}\nMileage: ${targetStickerVehicle.mileage.toLocaleString()} mi\nVIN: ${
                      targetStickerVehicle.vin
                    }\n Offered by ${state.settings.dealershipName}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold flex items-center gap-1.5"
                >
                  <span>Open WhatsApp Link</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* PRINTABLE BRANDED PDF REPORT MODAL */}
        {activeModal === 'pdf_report' && (
          <div className="text-xs">
            <div
              style={{ backgroundColor: state.settings.accentColor }}
              className="px-4 sm:px-5 py-4 text-white flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <div className="text-sm font-bold">
                  {state.settings.dealershipName} — Executive Dealership Statement
                </div>
                <div className="text-[11px] opacity-90 font-mono">
                  Generated {new Date().toISOString().slice(0, 10)} · Role:{' '}
                  {state.settings.activeRole}
                </div>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded bg-black/25 hover:bg-black/40 text-white font-semibold flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print PDF</span>
                </button>
                <button type="button" onClick={closeModal} aria-label="Close modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
                <div className="p-3 rounded border border-slate-200">
                  <div className="text-[10px] font-sans text-slate-500">
                    Active Units in Stock
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {state.vehicles.filter((v) => v.status !== 'Sold').length}
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-200">
                  <div className="text-[10px] font-sans text-slate-500">
                    Gross Sales Revenue
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {fmtMoney(
                      state.sales.reduce((s, r) => s + r.saleAmount, 0)
                    )}
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-200">
                  <div className="text-[10px] font-sans text-slate-500">
                    Realized Net Profit
                  </div>
                  <div className="text-lg font-bold text-emerald-600">
                    {fmtMoney(
                      state.sales.reduce((s, r) => s + r.netProfitSnapshot, 0),
                      true
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left border-collapse border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-bold">
                      <th className="p-2 border-b">STOCK</th>
                      <th className="p-2 border-b">VEHICLE</th>
                      <th className="p-2 border-b">STATUS</th>
                      <th className="p-2 border-b text-right">ALL-IN COST</th>
                      <th className="p-2 border-b text-right">ASKING / SOLD</th>
                      <th className="p-2 border-b text-right">NET PROFIT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px] tabular-nums">
                    {state.vehicles.map((v) => (
                      <tr key={v.id}>
                        <td className="p-2">{v.stockId}</td>
                        <td className="p-2 font-sans font-medium">
                          {v.year} {v.make} {v.model}
                        </td>
                        <td className="p-2 font-sans">{v.status}</td>
                        <td className="p-2 text-right">
                          {fmtMoney(
                            calculateVehicleTotalCost(v, state.expenses),
                            true
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {fmtMoney(v.soldPrice || v.askingPrice)}
                        </td>
                        <td className="p-2 text-right font-bold text-emerald-700">
                          {fmtMoney(
                            calculateVehicleNetProfit(
                              v,
                              state.expenses,
                              state.sales
                            ),
                            true
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WHAT'S NEW IN v2.5.0 MODAL */}
        {activeModal === 'whats_new' && (
          <div className="text-xs">
            <div className="px-5 py-4 bg-[#18181b] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#f17832]" />
                <span className="text-sm font-bold">
                  What&apos;s New in Car Dealer Tracker v2.5.0
                </span>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close modal">
                <X className="w-4 h-4 text-zinc-400 hover:text-white" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                <div className="font-bold text-slate-900">
                  1. Voice to Work AI Assistant (Preview-Then-Confirm + 1-Click Undo)
                </div>
                <p className="text-slate-600 mt-1">
                  Speak or type lot actions or upload receipt photos. Every write mutation presents a structured Before → After confirmation card and supports 1-click rollback.
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                <div className="font-bold text-slate-900">
                  2. Unified Unit Accounting (&quot;One Profit Everywhere&quot;)
                </div>
                <p className="text-slate-600 mt-1">
                  Vehicle purchases, reconditioning expenses, FIFO part allocations, and debt settlements automatically synchronize with your treasury bank and cash accounts.
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                <div className="font-bold text-slate-900">
                  3. Strict Role-Based Access Control (RBAC)
                </div>
                <p className="text-slate-600 mt-1">
                  Switch roles between Owner, Admin, Sales, and Viewer to mask sensitive purchase costs, margins, and bank balances on the showroom floor.
                </p>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 rounded text-white font-semibold flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Got It</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GLOBAL COMMAND PALETTE (Cmd+K / Ctrl+K) */}
        {activeModal === 'command_search' && (
          <div
            className="text-xs flex flex-col"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCmdActiveIndex((prev) =>
                  cmdFilteredResults.length > 0
                    ? (prev + 1) % cmdFilteredResults.length
                    : 0
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCmdActiveIndex((prev) =>
                  cmdFilteredResults.length > 0
                    ? (prev - 1 + cmdFilteredResults.length) %
                      cmdFilteredResults.length
                    : 0
                );
              } else if (e.key === 'Enter' && cmdFilteredResults[cmdActiveIndex]) {
                e.preventDefault();
                jumpToCommandPaletteResult(cmdFilteredResults[cmdActiveIndex]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
              }
            }}
          >
            {/* Top Search Input Bar */}
            <div className="p-3.5 bg-[#18181b] text-white border-b border-zinc-800 flex items-center gap-2.5">
              <Search className="w-4 h-4 text-[#f17832] shrink-0" />
              <input
                type="text"
                autoFocus
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Jump to any vehicle (VIN, stock, make), CRM client, or treasury record..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-400 focus:outline-none min-w-0"
                aria-label="Global Command Palette Search Input"
              />
              {cmdQuery && (
                <button
                  type="button"
                  onClick={() => setCmdQuery('')}
                  className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px]"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={closeModal}
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[10px] shrink-0"
              >
                ESC
              </button>
            </div>

            {/* Domain Filter Tabs & Quick Search Chips */}
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(
                  [
                    {
                      id: 'all',
                      label: 'All Records',
                      count: cmdCategoryCounts.all,
                    },
                    {
                      id: 'inventory',
                      label: 'Inventory',
                      count: cmdCategoryCounts.inventory,
                    },
                    {
                      id: 'clients',
                      label: 'Clients (CRM)',
                      count: cmdCategoryCounts.clients,
                    },
                    {
                      id: 'treasury',
                      label: 'Treasury & Ledger',
                      count: cmdCategoryCounts.treasury,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCmdCategory(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      cmdCategory === tab.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                        cmdCategory === tab.id
                          ? 'bg-zinc-700 text-zinc-100'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px]">
                <span className="text-slate-400 font-mono shrink-0">Try:</span>
                {['CDT-', 'Negotiation', 'Chase', 'Audit', 'Recon'].map(
                  (chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCmdQuery(chip)}
                      className="px-1.5 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-mono whitespace-nowrap"
                    >
                      {chip}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Results List */}
            <div className="p-2 max-h-[380px] overflow-y-auto divide-y divide-slate-100">
              {cmdFilteredResults.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-2">
                  <div className="text-sm font-bold text-slate-700">
                    No matching records found for &ldquo;{cmdQuery}&rdquo;
                  </div>
                  <p className="text-xs text-slate-500">
                    Try searching by stock ID (e.g. CDT-101), client name or phone, or treasury category.
                  </p>
                </div>
              ) : (
                cmdFilteredResults.map((item, idx) => {
                  const isSelected = idx === cmdActiveIndex;
                  const CategoryIcon =
                    item.category === 'inventory'
                      ? Car
                      : item.category === 'clients'
                        ? Users
                        : Landmark;

                  const badgeColors =
                    item.badgeTone === 'emerald'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : item.badgeTone === 'amber'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : item.badgeTone === 'rose'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : item.badgeTone === 'blue'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : item.badgeTone === 'purple'
                              ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200';

                  const domainTag =
                    item.category === 'inventory'
                      ? 'Inventory'
                      : item.category === 'clients'
                        ? 'CRM Client'
                        : item.subType === 'account'
                          ? 'Treasury Account'
                          : item.subType === 'debt'
                            ? 'Counterparty Debt'
                            : item.subType === 'audit_log'
                              ? 'Voice Audit Log'
                              : 'Treasury Ledger';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setCmdActiveIndex(idx)}
                      onClick={() => jumpToCommandPaletteResult(item)}
                      className={`w-full py-2.5 px-3 text-left rounded-md transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-orange-50/90 border border-[#f17832]/40'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`mt-0.5 p-2 rounded-md border shrink-0 ${
                            item.category === 'inventory'
                              ? 'bg-slate-900 text-white border-slate-800'
                              : item.category === 'clients'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          <CategoryIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-700 font-semibold">
                              {domainTag}
                            </span>
                            <span className="font-bold text-slate-900 truncate">
                              {item.title}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-semibold ${badgeColors}`}
                            >
                              {item.badgeText}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pl-8 sm:pl-0">
                        <div className="text-left sm:text-right">
                          <div className="font-mono font-bold text-xs tabular-nums text-slate-900">
                            {item.rightPrimary}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {item.rightSecondary}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-semibold ${
                            isSelected
                              ? 'bg-[#f17832] text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span>Jump</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Command Palette Footer */}
            <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded flex items-center gap-0.5">
                    <CornerDownLeft className="w-2.5 h-2.5" /> Enter
                  </kbd>
                  <span>Jump to Record</span>
                </span>
              </div>
              <div>
                Showing {cmdFilteredResults.length} of {cmdCategoryCounts.all}{' '}
                indexed records
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
