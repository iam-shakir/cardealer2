import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calculator,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  GripVertical,
  Image as ImageIcon,
  Kanban,
  LayoutGrid,
  List,
  Lock,
  MessageCircle,
  Minus,
  PackagePlus,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  User,
  UserPlus,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useDealership } from '../context/DealershipContext';
import { VehiclePhoto } from '../components/AppShell';
import {
  ClientDocument,
  ClientDocumentCategory,
  CrmStage,
  CsvPartBatchInput,
  DealProfitPartSelection,
  ExpenseCategory,
  PartBatch,
} from '../types';
import {
  calculateDealProfitEstimate,
  createLocalKycDocumentBlobUrl,
  createScannedDocumentBlobUrl,
  getLowStockPartAlerts,
  getVehicleExpensesSum,
  parsePartsCsvText,
  SAMPLE_PARTS_CSV_TEMPLATE,
} from '../utils/accounting';

interface CameraScannerCapturePayload {
  docType: 'Vehicle Title' | 'Service Invoice';
  referenceCode: string;
  primaryTitle: string;
  counterpartyOrVendor: string;
  vinOrSku: string;
  amountText: string;
  notes: string;
  objectUrl: string;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
  quantity?: number;
  unitCost?: number;
  partCategory?: string;
}

interface CameraDocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDocType: 'Vehicle Title' | 'Service Invoice';
  targetContextLabel: string;
  defaultCounterpartyOrVendor: string;
  defaultVinOrSku: string;
  defaultPrimaryTitle: string;
  defaultAmountText: string;
  showPartsBatchFields?: boolean;
  onCaptureSave: (scanResult: CameraScannerCapturePayload) => void;
}

const CameraDocumentScannerModal: React.FC<CameraDocumentScannerModalProps> = ({
  isOpen,
  onClose,
  defaultDocType,
  targetContextLabel,
  defaultCounterpartyOrVendor,
  defaultVinOrSku,
  defaultPrimaryTitle,
  defaultAmountText,
  showPartsBatchFields = false,
  onCaptureSave,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [docType, setDocType] = useState<'Vehicle Title' | 'Service Invoice'>(
    defaultDocType
  );
  const [referenceCode, setReferenceCode] = useState(
    defaultDocType === 'Vehicle Title' ? 'TTL-TX-884210' : 'INV-SVC-40912'
  );
  const [primaryTitle, setPrimaryTitle] = useState(defaultPrimaryTitle);
  const [counterpartyOrVendor, setCounterpartyOrVendor] = useState(
    defaultCounterpartyOrVendor
  );
  const [vinOrSku, setVinOrSku] = useState(defaultVinOrSku);
  const [amountText, setAmountText] = useState(defaultAmountText);
  const [notes, setNotes] = useState(
    'Direct camera scan verified & attached to dealership record.'
  );
  const [partQuantity, setPartQuantity] = useState<number>(6);
  const [partUnitCost, setPartUnitCost] = useState<number>(52);
  const [partCategory, setPartCategory] = useState<string>('Brakes');

  const [cameraStatus, setCameraStatus] = useState<
    'requesting' | 'streaming' | 'fallback_optical'
  >('requesting');
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment'
  );
  const [capturedPreview, setCapturedPreview] = useState<{
    objectUrl: string;
    sizeBytes: number;
    mimeType: string;
    fileName: string;
  } | null>(null);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCameraStream = async (mode: 'environment' | 'user' = facingMode) => {
    stopCameraStream();
    setCameraStatus('requesting');
    setCameraErrorMsg(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraStatus('fallback_optical');
      setCameraErrorMsg(
        'Camera API unavailable in current browser environment — High-Res Optical Document Scanner engaged.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraStatus('streaming');
    } catch (err: any) {
      setCameraStatus('fallback_optical');
      setCameraErrorMsg(
        err?.message
          ? `Camera hardware/permission fallback (${err.message}) — Optical Document Scanner active.`
          : 'Physical webcam not detected — High-Res Optical Document Scanner active.'
      );
    }
  };

  useEffect(() => {
    if (isOpen) {
      setDocType(defaultDocType);
      setReferenceCode(
        defaultDocType === 'Vehicle Title' ? 'TTL-TX-884210' : 'INV-SVC-40912'
      );
      setPrimaryTitle(defaultPrimaryTitle);
      setCounterpartyOrVendor(defaultCounterpartyOrVendor);
      setVinOrSku(defaultVinOrSku);
      setAmountText(defaultAmountText);
      setCapturedPreview(null);
      void startCameraStream(facingMode);
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [
    isOpen,
    defaultDocType,
    defaultPrimaryTitle,
    defaultCounterpartyOrVendor,
    defaultVinOrSku,
    defaultAmountText,
  ]);

  if (!isOpen) return null;

  const handleCaptureFrame = () => {
    const effectiveAmountText = showPartsBatchFields
      ? `$${(partQuantity * partUnitCost).toFixed(2)} (${partQuantity} units @ $${partUnitCost.toFixed(2)})`
      : amountText;

    // If physical video stream is active and has frames, capture onto HTML5 canvas
    if (
      cameraStatus === 'streaming' &&
      videoRef.current &&
      canvasRef.current &&
      videoRef.current.videoWidth > 0 &&
      videoRef.current.videoHeight > 0
    ) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Stamp optical verification header bar onto the captured camera frame
        ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
        ctx.fillRect(0, canvas.height - 68, canvas.width, 68);
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(
          `✓ CAMERA SCAN VERIFIED · ${docType.toUpperCase()} #${referenceCode}`,
          20,
          canvas.height - 38
        );
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '13px sans-serif';
        ctx.fillText(
          `${primaryTitle} | ${counterpartyOrVendor} | ${vinOrSku} | ${effectiveAmountText}`,
          20,
          canvas.height - 14
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              setCapturedPreview({
                objectUrl: url,
                sizeBytes: blob.size,
                mimeType: 'image/png',
                fileName: `${docType.replace(/\s+/g, '_')}_${referenceCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`,
              });
            } else {
              const fallback = createScannedDocumentBlobUrl({
                docType,
                referenceCode,
                primaryTitle,
                counterpartyOrVendor,
                vinOrSku,
                amountText: effectiveAmountText,
                notes,
              });
              setCapturedPreview(fallback);
            }
          },
          'image/png',
          0.95
        );
        return;
      }
    }

    // Fallback or optical synthesis capture using local Blob + URL.createObjectURL
    const synthesized = createScannedDocumentBlobUrl({
      docType,
      referenceCode,
      primaryTitle,
      counterpartyOrVendor,
      vinOrSku,
      amountText: effectiveAmountText,
      notes,
    });
    setCapturedPreview(synthesized);
  };

  const handleConfirmSave = () => {
    const effectiveAmountText = showPartsBatchFields
      ? `$${(partQuantity * partUnitCost).toFixed(2)}`
      : amountText;

    const finalScan =
      capturedPreview ||
      createScannedDocumentBlobUrl({
        docType,
        referenceCode,
        primaryTitle,
        counterpartyOrVendor,
        vinOrSku,
        amountText: effectiveAmountText,
        notes,
      });

    onCaptureSave({
      docType,
      referenceCode,
      primaryTitle,
      counterpartyOrVendor,
      vinOrSku,
      amountText: effectiveAmountText,
      notes,
      objectUrl: finalScan.objectUrl,
      sizeBytes: finalScan.sizeBytes,
      mimeType: finalScan.mimeType,
      fileName: finalScan.fileName,
      quantity: partQuantity,
      unitCost: partUnitCost,
      partCategory,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scanner Modal Header */}
        <div className="bg-[#18181b] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#f17832] flex items-center justify-center text-white shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold flex flex-wrap items-center gap-2">
                <span>Direct Camera Document Scanner</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {cameraStatus === 'streaming'
                    ? '● Live Camera Stream'
                    : '● Optical Scanner Ready'}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                Target Record: <strong className="text-zinc-200">{targetContextLabel}</strong> · Physical Vehicle Titles &amp; Service Invoices
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera scanner"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scanner Body */}
        <div className="p-3.5 sm:p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 text-xs">
          {/* Left Column: Live Camera Viewfinder / Captured Scan Preview (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDocType('Vehicle Title');
                    setReferenceCode('TTL-TX-884210');
                    if (!showPartsBatchFields) {
                      setPrimaryTitle('2020 Honda Accord Sport · Clean Title');
                      setVinOrSku('1HGCV1F34LA019284');
                    }
                    setCapturedPreview(null);
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                    docType === 'Vehicle Title'
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Car className="w-3.5 h-3.5" />
                  <span>Physical Vehicle Title</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDocType('Service Invoice');
                    setReferenceCode('INV-SVC-40912');
                    if (!showPartsBatchFields) {
                      setPrimaryTitle('OEM Ceramic Brake Pads & Rotor Resurface');
                      setVinOrSku('BRK-PAD-01');
                    }
                    setCapturedPreview(null);
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                    docType === 'Service Invoice'
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Service / Parts Invoice</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    const nextMode =
                      facingMode === 'environment' ? 'user' : 'environment';
                    setFacingMode(nextMode);
                    void startCameraStream(nextMode);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 flex items-center gap-1"
                  title="Switch front/rear camera or retry camera permission"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Switch / Retry Cam</span>
                </button>
              </div>
            </div>

            {/* Viewfinder Box */}
            <div className="relative rounded-xl bg-slate-950 border-2 border-slate-800 overflow-hidden aspect-16/10 flex items-center justify-center">
              <canvas ref={canvasRef} className="hidden" />

              {capturedPreview ? (
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-2 relative">
                  <img
                    src={capturedPreview.objectUrl}
                    alt="Captured Document Scan"
                    className="max-h-full max-w-full object-contain rounded shadow-lg"
                  />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-emerald-600/95 text-white font-mono text-[11px] font-bold flex items-center gap-1.5 shadow">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>FRAME CAPTURED ({Math.round(capturedPreview.sizeBytes / 1024)} KB)</span>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${
                      cameraStatus === 'streaming' ? 'block' : 'hidden'
                    }`}
                  />

                  {cameraStatus !== 'streaming' && (
                    <div className="p-6 text-center space-y-2.5 max-w-md">
                      <div className="w-12 h-12 rounded-full bg-slate-800/90 border border-slate-700 text-[#f17832] flex items-center justify-center mx-auto">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-bold text-white">
                        Optical Document Viewfinder ({docType})
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {cameraErrorMsg ||
                          'Align physical vehicle title or service invoice inside the reticle frame and click Capture Document Scan below.'}
                      </p>
                      <div className="pt-1 font-mono text-[11px] text-emerald-400">
                        [ {referenceCode} · {primaryTitle} ]
                      </div>
                    </div>
                  )}

                  {/* Corner Reticle Alignment Guides */}
                  <div className="pointer-events-none absolute inset-5 border border-dashed border-emerald-400/50 rounded-lg">
                    <div className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-2 border-l-2 border-[#f17832]" />
                    <div className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-2 border-r-2 border-[#f17832]" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-2 border-l-2 border-[#f17832]" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-2 border-r-2 border-[#f17832]" />
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-emerald-300/90 bg-slate-950/70 px-2.5 py-1 rounded">
                      <span>ALIGN {docType.toUpperCase()} WITHIN FRAME</span>
                      <span>AUTO-DESKEW &amp; OCR STAMP</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Capture / Retake Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="text-[11px] text-slate-600">
                {capturedPreview ? (
                  <span className="text-emerald-700 font-semibold">
                    ✓ Scan converted to local <code className="font-mono">blob:</code> Object URL. Ready to save!
                  </span>
                ) : (
                  <span>
                    Click <strong>Capture Scan Frame</strong> to snap from camera &amp; generate document blob.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {capturedPreview && (
                  <button
                    type="button"
                    onClick={() => setCapturedPreview(null)}
                    className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retake</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCaptureFrame}
                  className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5 text-[#f17832]" />
                  <span>
                    {capturedPreview ? 'Re-Capture Frame' : '📸 Capture Scan Frame'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Extracted / Editable Document Metadata (5 cols) */}
          <div className="lg:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Scanned {docType} Metadata
                </span>
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Local Blob Storage
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {docType === 'Vehicle Title'
                    ? 'State Title / Certificate Number'
                    : 'Supplier Invoice / RO Number'}
                </label>
                <input
                  type="text"
                  value={referenceCode}
                  onChange={(e) => {
                    setReferenceCode(e.target.value);
                    setCapturedPreview(null);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {docType === 'Vehicle Title'
                    ? 'Vehicle Year / Make / Model'
                    : 'Part Name / Service Description'}
                </label>
                <input
                  type="text"
                  value={primaryTitle}
                  onChange={(e) => {
                    setPrimaryTitle(e.target.value);
                    setCapturedPreview(null);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {docType === 'Vehicle Title'
                      ? '17-Char VIN'
                      : 'Part SKU / Code'}
                  </label>
                  <input
                    type="text"
                    value={vinOrSku}
                    onChange={(e) => {
                      setVinOrSku(e.target.value);
                      setCapturedPreview(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {docType === 'Vehicle Title'
                      ? 'Transferor / Owner'
                      : 'Vendor / Supplier'}
                  </label>
                  <input
                    type="text"
                    value={counterpartyOrVendor}
                    onChange={(e) => {
                      setCounterpartyOrVendor(e.target.value);
                      setCapturedPreview(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>

              {showPartsBatchFields ? (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={partCategory}
                      onChange={(e) => setPartCategory(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-300 bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Batch Qty
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={partQuantity}
                      onChange={(e) => {
                        setPartQuantity(Math.max(1, Number(e.target.value) || 1));
                        setCapturedPreview(null);
                      }}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Unit Cost ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={partUnitCost}
                      onChange={(e) => {
                        setPartUnitCost(Math.max(0, Number(e.target.value) || 0));
                        setCapturedPreview(null);
                      }}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {docType === 'Vehicle Title'
                      ? 'Declared Trade-In / Acquisition Value'
                      : 'Invoice Total Amount'}
                  </label>
                  <input
                    type="text"
                    value={amountText}
                    onChange={(e) => {
                      setAmountText(e.target.value);
                      setCapturedPreview(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Compliance / Audit Note
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                style={{ backgroundColor: '#f17832' }}
                className="px-4 py-2 rounded-md font-bold text-white flex items-center gap-1.5 shadow-sm hover:opacity-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save &amp; Upload Scan to Record</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const QUICK_EXPENSE_TEMPLATES: Array<{
  label: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
}> = [
  {
    label: 'Standard Detail ($150)',
    amount: 150,
    category: 'Detailing',
    description: 'Standard interior/exterior lot detail wash & wax',
  },
  {
    label: 'Safety Inspection ($85)',
    amount: 85,
    category: 'Registration',
    description: 'State OBD-II emissions & safety inspection certificate',
  },
  {
    label: 'Auction Transport ($300)',
    amount: 300,
    category: 'Transport',
    description: 'Regional auction flatbed carrier delivery fee',
  },
  {
    label: 'Oil & Filter Service ($75)',
    amount: 75,
    category: 'Repairs',
    description: 'Full synthetic oil & spin-on filter lube service',
  },
];

export const ExpensesView: React.FC = () => {
  const { state, openModal, addExpense, fmtMoney, canMutate, showToast } =
    useDealership();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [vehicleFilter, setVehicleFilter] = useState<string>('All');
  const [employeeFilter, setEmployeeFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'amount'>('newest');
  const [showTemplates, setShowTemplates] = useState(false);

  const allTotal = state.expenses.reduce((s, e) => s + e.amount, 0);
  const monthTotal = state.expenses
    .filter((e) => e.date.startsWith('2026-11'))
    .reduce((s, e) => s + e.amount, 0);
  const vehicleReconTotal = state.expenses
    .filter((e) => e.type === 'Vehicle-linked')
    .reduce((s, e) => s + e.amount, 0);

  const filteredExpenses = state.expenses
    .filter((e) => {
      const matchesCat = categoryFilter === 'All' || e.category === categoryFilter;
      const matchesVeh =
        vehicleFilter === 'All' ||
        (vehicleFilter === 'General'
          ? e.type === 'General Overhead'
          : e.vehicleId === vehicleFilter);
      const matchesEmp =
        employeeFilter === 'All' || e.teamMember === employeeFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q);
      return matchesCat && matchesVeh && matchesEmp && matchesSearch;
    })
    .sort((a, b) =>
      sortBy === 'amount' ? b.amount - a.amount : b.date.localeCompare(a.date)
    );

  const filteredTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const handleExportCsv = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Type', 'Vehicle', 'Team Member', 'Amount'],
      ...filteredExpenses.map((e) => {
        const veh = state.vehicles.find((v) => v.id === e.vehicleId);
        return [
          e.date,
          `"${e.description.replace(/"/g, '""')}"`,
          e.category,
          e.type,
          veh ? `${veh.stockId} ${veh.year} ${veh.make} ${veh.model}` : 'General Overhead',
          e.teamMember,
          String(e.amount),
        ];
      }),
    ];
    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dealership_expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported expenses ledger to CSV.');
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Expenses &amp; Reconditioning Ledger
          </h1>
          <p className="text-xs text-slate-500">
            Track vehicle-linked recon costs and dealership overhead with automatic treasury deduction
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV Export</span>
          </button>

          <button
            type="button"
            onClick={() => openModal('pdf_report')}
            className="px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF Export</span>
          </button>

          {/* 1-Tap Quick Templates */}
          <div className="relative">
            <button
              type="button"
              disabled={!canMutate}
              onClick={() => setShowTemplates((p) => !p)}
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-[#f17832]" />
              <span>Templates</span>
            </button>

            {showTemplates && (
              <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-lg border border-slate-200 shadow-lg p-2 z-40">
                <div className="text-[11px] font-bold text-slate-500 px-2 py-1">
                  1-Tap Quick Recon Templates
                </div>
                {QUICK_EXPENSE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => {
                      const targetVehicle = state.vehicles.find(
                        (v) => v.status !== 'Sold'
                      );
                      addExpense({
                        amount: tpl.amount,
                        date: new Date().toISOString().slice(0, 10),
                        category: tpl.category,
                        type: targetVehicle ? 'Vehicle-linked' : 'General Overhead',
                        vehicleId: targetVehicle?.id,
                        teamMember: state.settings.displayName,
                        paidFromAccountId: state.accounts[0]?.id || 'acc-bank',
                        description: `${tpl.description}${
                          targetVehicle ? ` (${targetVehicle.stockId})` : ''
                        }`,
                      });
                      setShowTemplates(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded hover:bg-slate-50 text-xs flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">{tpl.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      + Apply
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('add_expense')}
            style={{ backgroundColor: state.settings.accentColor }}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add expense</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">All Expenses</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {fmtMoney(allTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            {state.expenses.length} total records
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">This Month</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {fmtMoney(monthTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500">November 2026</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">
            Vehicle Costs (Recon)
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#f17832]">
            {fmtMoney(vehicleReconTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Directly capitalized into unit cost
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Filtered Total</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {fmtMoney(filteredTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            {filteredExpenses.length} matching rows
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-200"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by expense category"
          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
        >
          <option value="All">All categories</option>
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

        <select
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          aria-label="Filter by vehicle"
          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
        >
          <option value="All">All vehicles</option>
          <option value="General">General Overhead Only</option>
          {state.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.stockId} — {v.year} {v.make} {v.model}
            </option>
          ))}
        </select>

        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          aria-label="Filter by employee"
          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
        >
          <option value="All">All team members</option>
          {Array.from(new Set(state.expenses.map((e) => e.teamMember))).map(
            (emp) => (
              <option key={emp} value={emp}>
                {emp}
              </option>
            )
          )}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'newest' | 'amount')}
          aria-label="Sort expenses"
          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
        >
          <option value="newest">Date: newest</option>
          <option value="amount">Amount: high-low</option>
        </select>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left border-collapse">
          <thead>
            <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
              <th className="py-3 px-4">DESCRIPTION</th>
              <th className="py-3 px-4">CATEGORY</th>
              <th className="py-3 px-4">VEHICLE</th>
              <th className="py-3 px-4">DATE</th>
              <th className="py-3 px-4 text-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {filteredExpenses.map((exp) => {
              const veh = state.vehicles.find((v) => v.id === exp.vehicleId);
              return (
                <tr key={exp.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <span>{exp.description}</span>
                      {exp.receiptUrl && (
                        <span title={`Attached receipt: ${exp.receiptUrl}`}>
                          <Receipt className="w-3.5 h-3.5 text-[#f17832] shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Logged by {exp.teamMember}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-700">
                    {exp.category}
                  </td>
                  <td className="py-3 px-4">
                    {veh ? (
                      <span className="font-mono text-slate-800">
                        {veh.stockId} · {veh.year} {veh.make} {veh.model}
                      </span>
                    ) : (
                      <span className="text-slate-500">General Overhead</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                    {exp.date}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                    {fmtMoney(exp.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SalesView: React.FC = () => {
  const {
    state,
    openModal,
    fmtMoney,
    isSensitiveVisible,
    canMutate,
    allocatePartToVehicle,
    updateClientStage,
    showToast,
  } = useDealership();

  // Tab & View switcher state
  const [salesTab, setSalesTab] = useState<'kanban' | 'records'>('kanban');
  const [kanbanSearch, setKanbanSearch] = useState('');
  const [kanbanStageFilter, setKanbanStageFilter] = useState<string>('All');
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CrmStage | null>(null);

  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [timeframe, setTimeframe] = useState<'all' | 'month' | '90d'>('all');

  const CRM_STAGES: CrmStage[] = [
    'New lead',
    'Contacted',
    'Viewing',
    'Negotiation',
    'Sold',
  ];

  const STAGE_CONFIG: Record<
    CrmStage,
    {
      title: string;
      color: string;
      bgColor: string;
      borderColor: string;
      badgeBg: string;
      description: string;
    }
  > = {
    'New lead': {
      title: 'New Leads',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50/50',
      borderColor: 'border-blue-200',
      badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
      description: 'Initial inquiries & web form leads',
    },
    Contacted: {
      title: 'Contacted',
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-50/50',
      borderColor: 'border-indigo-200',
      badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      description: 'Outreach call or WhatsApp completed',
    },
    Viewing: {
      title: 'Viewing / Test Drive',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50/50',
      borderColor: 'border-amber-200',
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
      description: 'Scheduled test drive or showroom visit',
    },
    Negotiation: {
      title: 'Negotiation',
      color: 'text-purple-700',
      bgColor: 'bg-purple-50/50',
      borderColor: 'border-purple-200',
      badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
      description: 'Price quote, finance desk, & deal profit calc',
    },
    Sold: {
      title: 'Contract Signed / Sold',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50/50',
      borderColor: 'border-emerald-200',
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      description: 'Finalized deal, contract signed & delivered',
    },
  };

  const handleMoveLeadStage = (leadId: string, targetStage: CrmStage) => {
    if (!canMutate) {
      showToast('Active role (Viewer) cannot modify lead stages.');
      return;
    }
    updateClientStage(leadId, targetStage);
  };

  // Interactive Deal Profit Calculator state
  const inStockVehicles = state.vehicles.filter((v) => v.status !== 'Sold');
  const defaultCalcVehicle = inStockVehicles[0] || state.vehicles[0];

  const [showCalculator, setShowCalculator] = useState<boolean>(true);
  const [calcVehicleId, setCalcVehicleId] = useState<string>(
    defaultCalcVehicle?.id || 'custom'
  );
  const [calcSalePrice, setCalcSalePrice] = useState<number>(
    defaultCalcVehicle?.askingPrice || 21900
  );
  const [calcPurchaseCost, setCalcPurchaseCost] = useState<number>(
    defaultCalcVehicle?.purchasePrice || 16500
  );
  const [calcExistingRecon, setCalcExistingRecon] = useState<number>(
    defaultCalcVehicle
      ? getVehicleExpensesSum(defaultCalcVehicle.id, state.expenses)
      : 280
  );
  const [calcManualRecon, setCalcManualRecon] = useState<number>(0);
  const [calcSelectedParts, setCalcSelectedParts] = useState<
    DealProfitPartSelection[]
  >([
    {
      partId: state.parts[0]?.id || 'part-1',
      quantity: 1,
    },
  ]);
  const [calcFixedOverhead, setCalcFixedOverhead] = useState<number>(350);
  const [calcOverheadPackPct, setCalcOverheadPackPct] = useState<number>(0);
  const [calcHoldingCost, setCalcHoldingCost] = useState<number>(
    defaultCalcVehicle?.accruedHoldingCost || 140
  );
  const [calcVatBenefit, setCalcVatBenefit] = useState<number>(0);

  // Sync calculator baseline when user selects a different vehicle preset
  const handleSelectCalcVehicle = (vehId: string) => {
    setCalcVehicleId(vehId);
    if (vehId === 'custom') {
      setCalcSalePrice(24500);
      setCalcPurchaseCost(18500);
      setCalcExistingRecon(0);
      setCalcHoldingCost(150);
      return;
    }
    const veh = state.vehicles.find((v) => v.id === vehId);
    if (veh) {
      setCalcSalePrice(veh.askingPrice);
      setCalcPurchaseCost(veh.purchasePrice);
      setCalcExistingRecon(getVehicleExpensesSum(veh.id, state.expenses));
      setCalcHoldingCost(veh.accruedHoldingCost || 0);
    }
  };

  const handleLoadLeadToCalculator = (vehicleId?: string) => {
    if (vehicleId) {
      handleSelectCalcVehicle(vehicleId);
    }
    setSalesTab('records');
    setShowCalculator(true);
  };

  const handleAdjustPartQty = (partId: string, delta: number) => {
    setCalcSelectedParts((prev) => {
      const existing = prev.find((p) => p.partId === partId);
      const currentQty = existing ? existing.quantity : 0;
      const nextQty = Math.max(0, currentQty + delta);
      if (nextQty === 0) {
        return prev.filter((p) => p.partId !== partId);
      }
      if (existing) {
        return prev.map((p) =>
          p.partId === partId ? { ...p, quantity: nextQty } : p
        );
      }
      return [...prev, { partId, quantity: nextQty }];
    });
  };

  // Prorate general overhead expenses across active in-stock inventory
  const totalGeneralOverhead = state.expenses
    .filter((e) => e.type === 'General Overhead')
    .reduce((sum, e) => sum + e.amount, 0);
  const proratedOverheadPerUnit = Math.round(
    totalGeneralOverhead / Math.max(1, inStockVehicles.length)
  );

  const dealEstimate = calculateDealProfitEstimate(
    {
      salePrice: calcSalePrice,
      purchaseCost: calcPurchaseCost,
      existingReconCost: calcExistingRecon,
      manualReconCost: calcManualRecon,
      selectedParts: calcSelectedParts,
      fixedOverheadAllocation: calcFixedOverhead,
      overheadPackPct: calcOverheadPackPct,
      holdingCostAllocation: calcHoldingCost,
      vatOrDocFeeBenefit: calcVatBenefit,
    },
    state.partBatches,
    state.parts
  );

  const handleResetCalculator = () => {
    handleSelectCalcVehicle(calcVehicleId);
    setCalcManualRecon(0);
    setCalcSelectedParts([]);
    setCalcFixedOverhead(proratedOverheadPerUnit);
    setCalcOverheadPackPct(0);
    setCalcVatBenefit(0);
  };

  const handleFinalizeFromCalculator = () => {
    if (calcVehicleId !== 'custom' && canMutate) {
      // Optionally allocate selected FIFO parts to the vehicle if user wants them recorded
      calcSelectedParts.forEach((sel) => {
        if (sel.quantity > 0) {
          allocatePartToVehicle({
            partId: sel.partId,
            vehicleId: calcVehicleId,
            quantity: sel.quantity,
            notes: 'Allocated via SalesView Deal Profit Calculator prior to sale',
          });
        }
      });
      openModal('record_sale', { vehicleId: calcVehicleId });
    } else {
      openModal('record_sale');
    }
  };

  const filteredSales = state.sales.filter((s) => {
    const veh = state.vehicles.find((v) => v.id === s.vehicleId);
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      s.buyerName.toLowerCase().includes(q) ||
      (veh &&
        `${veh.year} ${veh.make} ${veh.model} ${veh.stockId}`
          .toLowerCase()
          .includes(q));
    const matchesPay =
      paymentFilter === 'All' ||
      (paymentFilter === 'Partial'
        ? s.paymentMethod === 'Financed / Partial Receivable'
        : s.paymentMethod !== 'Financed / Partial Receivable');
    const matchesTime =
      timeframe === 'all' ||
      (timeframe === 'month' ? s.saleDate.startsWith('2026-11') : true);
    return matchesSearch && matchesPay && matchesTime;
  });

  const totalRev = filteredSales.reduce((s, r) => s + r.saleAmount, 0);
  const totalProf = filteredSales.reduce((s, r) => s + r.netProfitSnapshot, 0);
  const avgProf =
    filteredSales.length > 0 ? Math.round(totalProf / filteredSales.length) : 0;

  // Calculate visual bar percentages
  const barDenominator = Math.max(
    dealEstimate.salePrice,
    dealEstimate.totalAllInCost,
    1
  );
  const purchaseBarPct = Math.min(
    100,
    Math.round((dealEstimate.purchaseCost / barDenominator) * 100)
  );
  const reconBarPct = Math.min(
    100 - purchaseBarPct,
    Math.round((dealEstimate.totalReconCost / barDenominator) * 100)
  );
  const overheadBarPct = Math.min(
    100 - purchaseBarPct - reconBarPct,
    Math.round((dealEstimate.totalOverheadCost / barDenominator) * 100)
  );
  const profitBarPct =
    dealEstimate.estimatedNetProfit > 0
      ? Math.max(0, 100 - purchaseBarPct - reconBarPct - overheadBarPct)
      : 0;

  // Kanban Lead Calculations
  const filteredKanbanLeads = state.clients.filter((client) => {
    const q = kanbanSearch.trim().toLowerCase();
    const veh = client.vehicleId ? state.vehicles.find((v) => v.id === client.vehicleId) : null;
    const vehText = veh ? `${veh.stockId} ${veh.year} ${veh.make} ${veh.model}`.toLowerCase() : '';
    const matchesSearch =
      !q ||
      client.name.toLowerCase().includes(q) ||
      client.phone.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q) ||
      client.request.toLowerCase().includes(q) ||
      vehText.includes(q);
    const matchesStage =
      kanbanStageFilter === 'All' || client.stage === kanbanStageFilter;
    return matchesSearch && matchesStage;
  });

  const totalPipelineValue = state.clients.reduce((sum, c) => {
    const veh = c.vehicleId ? state.vehicles.find((v) => v.id === c.vehicleId) : null;
    return sum + (veh ? veh.askingPrice : 20000);
  }, 0);

  const overdueCount = state.clients.filter((c) => c.isOverdue).length;
  const negotiationCount = state.clients.filter((c) => c.stage === 'Negotiation').length;

  return (
    <div className="space-y-5">
      {/* Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Sales &amp; CRM Deal Desk
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Firebase Real-time CRM</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track buyer leads from contact to final contract signature, calculate FIFO deal margins, and finalize unit sales
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Main View Switcher Tabs */}
          <div className="p-1 rounded-lg bg-slate-100 border border-slate-200 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSalesTab('kanban')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                salesTab === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5 text-[#f17832]" />
              <span>CRM Pipeline</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-orange-100 text-[#f17832]">
                {state.clients.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSalesTab('records')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                salesTab === 'records'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-[#f17832]" />
              <span>Sales Ledger &amp; Calculator</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 text-slate-700">
                {state.sales.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('add_client')}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#f17832]" />
            <span>+ Add Lead</span>
          </button>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('record_sale')}
            style={{ backgroundColor: state.settings.accentColor }}
            className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Record sale</span>
          </button>
        </div>
      </div>

      {salesTab === 'kanban' ? (
        <div className="space-y-4">
          {/* CRM Pipeline KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active Pipeline Leads</div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                {state.clients.length} <span className="text-xs font-normal text-slate-500">leads</span>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Potential Deal Value</div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                {fmtMoney(totalPipelineValue)}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active Negotiations</div>
              <div className="mt-1 text-xl font-bold font-mono text-purple-700">
                {negotiationCount} <span className="text-xs font-normal text-slate-500">deals</span>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Overdue Follow-ups</div>
              <div className={`mt-1 text-xl font-bold font-mono ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {overdueCount} <span className="text-xs font-normal text-slate-500">clients</span>
              </div>
            </div>
          </div>

          {/* Kanban Search & Filter Bar */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={kanbanSearch}
                onChange={(e) => setKanbanSearch(e.target.value)}
                placeholder="Search lead name, phone, VIN, vehicle..."
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#f17832]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-slate-500 text-xs whitespace-nowrap">Stage Filter:</span>
              <select
                value={kanbanStageFilter}
                onChange={(e) => setKanbanStageFilter(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-slate-200 bg-white font-medium text-slate-800"
              >
                <option value="All">All Pipeline Stages</option>
                {CRM_STAGES.map((stg) => (
                  <option key={stg} value={stg}>
                    {STAGE_CONFIG[stg].title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => openModal('add_client')}
                disabled={!canMutate}
                className="px-3 py-1.5 rounded-md bg-[#f17832] text-white font-semibold text-xs flex items-center gap-1 hover:opacity-95 disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Lead</span>
              </button>
            </div>
          </div>

          {/* 5-Column Kanban Board Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 items-start">
            {CRM_STAGES.map((stage) => {
              const cfg = STAGE_CONFIG[stage];
              const stageLeads = filteredKanbanLeads.filter((c) => c.stage === stage);
              const stageValue = stageLeads.reduce((s, c) => {
                const veh = c.vehicleId ? state.vehicles.find((v) => v.id === c.vehicleId) : null;
                return s + (veh ? veh.askingPrice : 0);
              }, 0);

              const isDropTarget = dragOverStage === stage;

              return (
                <div
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStage(stage);
                  }}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const leadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
                    if (leadId && canMutate) {
                      handleMoveLeadStage(leadId, stage);
                    }
                    setDraggingLeadId(null);
                    setDragOverStage(null);
                  }}
                  className={`rounded-xl border p-3 min-h-[480px] flex flex-col transition-all ${cfg.bgColor} ${cfg.borderColor} ${
                    isDropTarget ? 'ring-2 ring-[#f17832] bg-orange-50/70 scale-[1.01]' : ''
                  }`}
                >
                  {/* Column Header */}
                  <div className="pb-2.5 mb-2.5 border-b border-slate-200/80">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                        {cfg.title}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border ${cfg.badgeBg}`}>
                        {stageLeads.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span className="truncate">{cfg.description}</span>
                      {stageValue > 0 && (
                        <span className="font-mono font-semibold text-slate-700 shrink-0">
                          {fmtMoney(stageValue)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Column Card Stream */}
                  <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[620px] pr-0.5">
                    {stageLeads.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400 my-4">
                        No leads in {cfg.title}
                      </div>
                    ) : (
                      stageLeads.map((lead) => {
                        const targetVeh = lead.vehicleId
                          ? state.vehicles.find((v) => v.id === lead.vehicleId)
                          : null;
                        const lastInteraction = lead.interactions[lead.interactions.length - 1];

                        return (
                          <div
                            key={lead.id}
                            draggable={canMutate}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', lead.id);
                              setDraggingLeadId(lead.id);
                            }}
                            onDragEnd={() => {
                              setDraggingLeadId(null);
                              setDragOverStage(null);
                            }}
                            className={`p-3 rounded-lg bg-white border border-slate-200 shadow-xs space-y-2.5 transition-all hover:shadow-md hover:border-slate-300 ${
                              draggingLeadId === lead.id ? 'opacity-40 scale-95' : ''
                            }`}
                          >
                            {/* Card Top Row: Lead Name & Drag Handle */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-slate-900 truncate">
                                  {lead.name}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 truncate flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400 inline" />
                                  <span>{lead.phone}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {lead.isOverdue && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 animate-pulse">
                                    Overdue
                                  </span>
                                )}
                                <GripVertical className="w-4 h-4 text-slate-300 hover:text-slate-500 cursor-grab shrink-0" />
                              </div>
                            </div>

                            {/* Vehicle Interest Badge */}
                            {targetVeh ? (
                              <div className="p-2 rounded-md bg-slate-50 border border-slate-200 text-xs">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-slate-800 truncate">
                                    {targetVeh.year} {targetVeh.make} {targetVeh.model}
                                  </span>
                                  <span className="font-mono font-bold text-[#f17832] shrink-0 ml-1">
                                    {fmtMoney(targetVeh.askingPrice)}
                                  </span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center justify-between">
                                  <span>Stock: {targetVeh.stockId}</span>
                                  <span className="capitalize">{targetVeh.status}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-md bg-slate-100/70 border border-slate-200 text-[11px] text-slate-600 font-mono">
                                General Vehicle Inquiry
                              </div>
                            )}

                            {/* Preferred Contact / Note Snippet */}
                            {(lastInteraction || lead.request) && (
                              <div className="text-[11px] text-slate-600 line-clamp-2 bg-slate-50/70 p-1.5 rounded border border-slate-100">
                                <span className="font-semibold text-slate-700">Note: </span>
                                {lastInteraction ? lastInteraction.note : lead.request}
                              </div>
                            )}

                            {/* Action & Stage Navigation Bar */}
                            <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                              {/* Stage Selector & Quick Step Buttons */}
                              <div className="flex items-center justify-between gap-1">
                                <button
                                  type="button"
                                  disabled={!canMutate || CRM_STAGES.indexOf(lead.stage) === 0}
                                  onClick={() => {
                                    const idx = CRM_STAGES.indexOf(lead.stage);
                                    if (idx > 0) handleMoveLeadStage(lead.id, CRM_STAGES[idx - 1]);
                                  }}
                                  title="Move to previous stage"
                                  className="w-6 h-6 rounded border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30 shrink-0 text-xs font-bold"
                                >
                                  &larr;
                                </button>

                                <select
                                  disabled={!canMutate}
                                  value={lead.stage}
                                  onChange={(e) => handleMoveLeadStage(lead.id, e.target.value as CrmStage)}
                                  className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 flex-1 min-w-0 truncate"
                                >
                                  {CRM_STAGES.map((stg) => (
                                    <option key={stg} value={stg}>
                                      {STAGE_CONFIG[stg].title}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  disabled={!canMutate || CRM_STAGES.indexOf(lead.stage) === CRM_STAGES.length - 1}
                                  onClick={() => {
                                    const idx = CRM_STAGES.indexOf(lead.stage);
                                    if (idx < CRM_STAGES.length - 1) handleMoveLeadStage(lead.id, CRM_STAGES[idx + 1]);
                                  }}
                                  title="Advance to next stage"
                                  className="w-6 h-6 rounded border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30 shrink-0 text-xs font-bold"
                                >
                                  &rarr;
                                </button>
                              </div>

                              {/* Specialized CTAs depending on stage */}
                              {lead.stage === 'Negotiation' && targetVeh && (
                                <button
                                  type="button"
                                  onClick={() => handleLoadLeadToCalculator(targetVeh.id)}
                                  className="w-full py-1.5 px-2 rounded bg-purple-50 hover:bg-purple-100 border border-purple-200 text-[11px] font-bold text-purple-800 flex items-center justify-center gap-1 transition-colors"
                                >
                                  <Calculator className="w-3 h-3 text-purple-600" />
                                  <span>Load in Deal Calculator</span>
                                </button>
                              )}

                              {(lead.stage === 'Negotiation' || lead.stage === 'Sold') && (
                                <button
                                  type="button"
                                  disabled={!canMutate}
                                  onClick={() => openModal('record_sale', { vehicleId: lead.vehicleId })}
                                  className="w-full py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-white" />
                                  <span>Finalize &amp; Record Sale</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header Action Row for Records & Calculator */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCalculator((prev) => !prev)}
              className={`px-3.5 py-2 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                showCalculator
                  ? 'border-[#f17832] bg-orange-50 text-[#f17832]'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-[#f17832]" />
              <span>
                {showCalculator
                  ? 'Hide Deal Profit Calculator'
                  : 'Deal Profit Calculator'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => openModal('deal_desk')}
              className="px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#f17832]" />
              <span>Quick Modal Simulator</span>
            </button>
          </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Sales Revenue</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {fmtMoney(totalRev)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Gross proceeds across {filteredSales.length} deals
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">
            Calculated Profit
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600">
            {fmtMoney(totalProf, true)}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            {isSensitiveVisible
              ? `Avg per unit: ${fmtMoney(avgProf, true)}`
              : 'Hidden for active role'}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Vehicles Sold</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {filteredSales.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Delivered retail units</div>
        </div>
      </div>

      {/* INTERACTIVE DEAL PROFIT CALCULATOR PANEL */}
      {showCalculator && (
        <div
          id="deal-profit-calculator"
          className="bg-white rounded-lg border-2 border-slate-200 shadow-xs overflow-hidden"
        >
          {/* Top Bar */}
          <div className="bg-[#18181b] text-white px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-[#f17832]/20 border border-[#f17832]/40 flex items-center justify-center text-[#f17832] shrink-0">
                <Calculator className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold tracking-tight text-white">
                    Interactive Deal Profit Calculator
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#f17832] text-white">
                    FIFO Parts + Overhead Linked
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Model purchase price, live PartsView FIFO reconditioning batches, and lot overhead allocations to estimate net profit margin before finalizing a deal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
              <select
                value={calcVehicleId}
                onChange={(e) => handleSelectCalcVehicle(e.target.value)}
                aria-label="Select vehicle preset for deal calculator"
                className="px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs font-semibold text-white flex-1 sm:flex-initial min-w-0 truncate"
              >
                {inStockVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.stockId} · {v.year} {v.make} {v.model} (Ask {fmtMoney(v.askingPrice)})
                  </option>
                ))}
                <option value="custom">Custom / Pre-Acquisition Unit</option>
              </select>

              <button
                type="button"
                onClick={handleResetCalculator}
                title="Reset calculator to unit defaults"
                className="px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Calculator 3-Column Body */}
          <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Column 1: Acquisition, Sale Price & Labor Recon (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                <DollarSign className="w-3.5 h-3.5 text-[#f17832]" />
                <span>1. Acquisition &amp; Deal Pricing</span>
              </div>

              {/* Target Sale Price */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="calc-sale-price"
                    className="font-semibold text-slate-700"
                  >
                    Target Deal Sale Price ($)
                  </label>
                  <span className="font-mono font-bold text-slate-900">
                    {fmtMoney(calcSalePrice)}
                  </span>
                </div>
                <input
                  id="calc-sale-price"
                  type="number"
                  min={0}
                  step={100}
                  value={calcSalePrice}
                  onChange={(e) => setCalcSalePrice(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs font-bold text-slate-900"
                />
                <input
                  type="range"
                  min={Math.max(1000, Math.round(calcPurchaseCost * 0.7))}
                  max={Math.max(50000, Math.round(calcPurchaseCost * 1.6))}
                  step={100}
                  value={calcSalePrice}
                  onChange={(e) => setCalcSalePrice(Number(e.target.value))}
                  aria-label="Target Sale Price Slider"
                  className="w-full accent-[#f17832]"
                />
              </div>

              {/* Purchase Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label
                    htmlFor="calc-purchase-cost"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Purchase Cost ($)
                  </label>
                  <input
                    id="calc-purchase-cost"
                    type="number"
                    min={0}
                    step={100}
                    value={calcPurchaseCost}
                    onChange={(e) =>
                      setCalcPurchaseCost(Number(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 font-mono font-semibold"
                  />
                </div>

                <div>
                  <label
                    htmlFor="calc-existing-recon"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Logged Recon Expenses ($)
                  </label>
                  <input
                    id="calc-existing-recon"
                    type="number"
                    min={0}
                    step={25}
                    value={calcExistingRecon}
                    onChange={(e) =>
                      setCalcExistingRecon(Number(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 font-mono"
                  />
                </div>
              </div>

              {/* Additional Labor / Shop Recon & Overhead Allocations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label
                    htmlFor="calc-manual-recon"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Est. Shop / Labor Recon ($)
                  </label>
                  <input
                    id="calc-manual-recon"
                    type="number"
                    min={0}
                    step={25}
                    value={calcManualRecon}
                    onChange={(e) =>
                      setCalcManualRecon(Number(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="calc-holding-cost"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Floorplan / Holding Cost ($)
                  </label>
                  <input
                    id="calc-holding-cost"
                    type="number"
                    min={0}
                    step={10}
                    value={calcHoldingCost}
                    onChange={(e) =>
                      setCalcHoldingCost(Number(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 font-mono"
                  />
                </div>
              </div>

              {/* Overhead Allocation Section */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Overhead Allocation (Rent, Marketing, Admin)
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalcFixedOverhead(proratedOverheadPerUnit)}
                    className="text-[11px] font-semibold text-[#f17832] hover:underline flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Auto-Prorate ({fmtMoney(proratedOverheadPerUnit)})</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="calc-fixed-overhead"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Fixed Overhead ($/unit)
                    </label>
                    <input
                      id="calc-fixed-overhead"
                      type="number"
                      min={0}
                      step={25}
                      value={calcFixedOverhead}
                      onChange={(e) =>
                        setCalcFixedOverhead(Number(e.target.value) || 0)
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="calc-overhead-pack-pct"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Variable Pack (% of Cost)
                    </label>
                    <input
                      id="calc-overhead-pack-pct"
                      type="number"
                      min={0}
                      max={25}
                      step={0.5}
                      value={calcOverheadPackPct}
                      onChange={(e) =>
                        setCalcOverheadPackPct(Number(e.target.value) || 0)
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Reconditioning Parts Picker from PartsView (FIFO) (4 cols) */}
            <div className="lg:col-span-4 space-y-3 flex flex-col">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#f17832]" />
                  <span>2. Reconditioning Parts (PartsView FIFO)</span>
                </div>
                <span className="text-xs font-mono font-bold text-[#f17832]">
                  +{fmtMoney(dealEstimate.fifoPartsReconCost)}
                </span>
              </div>

              <p className="text-[11px] text-slate-500">
                Select parts from your active FIFO inventory to include their exact oldest-batch unit cost in this deal&apos;s reconditioning estimate:
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 flex-1">
                {state.parts.map((part) => {
                  const activeBatches = state.partBatches
                    .filter((b) => b.partId === part.id && b.remainingQty > 0)
                    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
                  const totalAvail = activeBatches.reduce(
                    (s, b) => s + b.remainingQty,
                    0
                  );
                  const nextFifoCost = activeBatches[0]?.unitCost || 0;
                  const selItem = calcSelectedParts.find(
                    (s) => s.partId === part.id
                  );
                  const selectedQty = selItem ? selItem.quantity : 0;
                  const breakdownItem = dealEstimate.partsBreakdown.find(
                    (b) => b.partId === part.id
                  );

                  return (
                    <div
                      key={part.id}
                      className={`p-2.5 rounded-lg border text-xs transition-all ${
                        selectedQty > 0
                          ? 'border-[#f17832] bg-orange-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">
                            {part.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {part.code} · {totalAvail} in stock · Next FIFO:{' '}
                            <strong className="text-slate-700">
                              {fmtMoney(nextFifoCost)}/ea
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleAdjustPartQty(part.id, -1)}
                            disabled={selectedQty === 0}
                            aria-label={`Decrease quantity for ${part.name}`}
                            className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center disabled:opacity-40"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-mono font-bold text-slate-900">
                            {selectedQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustPartQty(part.id, 1)}
                            aria-label={`Increase quantity for ${part.name}`}
                            className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {breakdownItem && (
                        <div className="mt-1.5 pt-1.5 border-t border-orange-200/70 flex items-center justify-between text-[11px] font-mono text-[#f17832]">
                          <span className="truncate">
                            {breakdownItem.batchSummary}
                          </span>
                          <span className="font-bold shrink-0 ml-2">
                            {fmtMoney(breakdownItem.fifoTotalCost)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 3: Live Profit & Margin Output Summary (4 cols) */}
            <div className="lg:col-span-4 bg-slate-900 text-white rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                    3. Estimated Unit Economics
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      dealEstimate.marginHealth === 'Strong'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : dealEstimate.marginHealth === 'Healthy'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : dealEstimate.marginHealth === 'Thin'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {dealEstimate.marginHealth === 'Strong'
                      ? 'Strong Margin (15%+)'
                      : dealEstimate.marginHealth === 'Healthy'
                      ? 'Healthy Margin (8–15%)'
                      : dealEstimate.marginHealth === 'Thin'
                      ? 'Thin Margin (<8%)'
                      : 'Projected Net Loss'}
                  </span>
                </div>

                {/* Primary Net Profit & Margin Display */}
                <div className="p-3.5 rounded-lg bg-zinc-800/90 border border-zinc-700/80 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-zinc-400">
                      Est. Net Profit
                    </div>
                    <div
                      className={`text-2xl font-bold font-mono tabular-nums mt-0.5 ${
                        dealEstimate.estimatedNetProfit >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {dealEstimate.estimatedNetProfit >= 0 ? '+' : ''}
                      {fmtMoney(dealEstimate.estimatedNetProfit, true)}
                    </div>
                  </div>
                  <div className="border-l border-zinc-700 pl-3">
                    <div className="text-[11px] text-zinc-400">
                      Net Profit Margin
                    </div>
                    <div
                      className={`text-2xl font-bold font-mono tabular-nums mt-0.5 ${
                        dealEstimate.netProfitMarginPct >= 15
                          ? 'text-emerald-400'
                          : dealEstimate.netProfitMarginPct >= 8
                          ? 'text-amber-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {dealEstimate.netProfitMarginPct.toFixed(1)}%
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      ROI on Cost: {dealEstimate.roiPct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Stacked Cost vs Margin Visual Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span>Deal Cost &amp; Margin Split</span>
                    <span>Sale: {fmtMoney(dealEstimate.salePrice)}</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden flex">
                    <div
                      style={{ width: `${purchaseBarPct}%` }}
                      className="bg-slate-400 h-full"
                      title={`Purchase: ${purchaseBarPct}%`}
                    />
                    <div
                      style={{ width: `${reconBarPct}%` }}
                      className="bg-[#f17832] h-full"
                      title={`Recon & FIFO Parts: ${reconBarPct}%`}
                    />
                    <div
                      style={{ width: `${overheadBarPct}%` }}
                      className="bg-amber-400 h-full"
                      title={`Overhead: ${overheadBarPct}%`}
                    />
                    <div
                      style={{ width: `${profitBarPct}%` }}
                      className="bg-emerald-500 h-full"
                      title={`Net Profit: ${profitBarPct}%`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400 font-mono">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-slate-400" />
                      Purchase
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-[#f17832]" />
                      Recon/Parts
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-amber-400" />
                      Overhead
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-emerald-500" />
                      Margin
                    </span>
                  </div>
                </div>

                {/* Itemized Cost Ledger */}
                <div className="space-y-1.5 text-xs font-mono border-t border-zinc-800 pt-2.5">
                  <div className="flex justify-between text-zinc-300">
                    <span>Vehicle Purchase Cost:</span>
                    <span>{fmtMoney(dealEstimate.purchaseCost, true)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span>
                      Reconditioning (Logged + PartsView FIFO):
                    </span>
                    <span className="text-[#f17832]">
                      +{fmtMoney(dealEstimate.totalReconCost, true)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span>Overhead &amp; Holding Allocations:</span>
                    <span className="text-amber-300">
                      +{fmtMoney(dealEstimate.totalOverheadCost, true)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-white border-t border-zinc-800 pt-1.5">
                    <span>Total All-In Unit Cost:</span>
                    <span>{fmtMoney(dealEstimate.totalAllInCost, true)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-zinc-400 pt-1">
                    <span>Break-Even Floor / 15% Target:</span>
                    <span>
                      {fmtMoney(dealEstimate.breakEvenPrice)} /{' '}
                      <strong className="text-emerald-300">
                        {fmtMoney(dealEstimate.target15MarginPrice)}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action CTA */}
              <button
                type="button"
                disabled={!canMutate}
                onClick={handleFinalizeFromCalculator}
                style={{ backgroundColor: state.settings.accentColor }}
                className="w-full py-2.5 px-4 rounded-md text-xs font-bold text-white flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50 shadow-sm"
              >
                <span>Finalize Deal &amp; Record Sale</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicle or buyer name..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-200"
          />
        </div>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          aria-label="Filter by payment status"
          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
        >
          <option value="All">All payments</option>
          <option value="Paid">Paid in full</option>
          <option value="Partial">Partial / Receivable</option>
        </select>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value as any)}
          aria-label="Filter by timeframe"
          className="px-3 py-1.5 rounded-md border border-slate-200 bg-white"
        >
          <option value="all">All time</option>
          <option value="month">This month</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left border-collapse">
          <thead>
            <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
              <th className="py-3 px-4">VEHICLE</th>
              <th className="py-3 px-4">BUYER</th>
              <th className="py-3 px-4">SALE DATE</th>
              <th className="py-3 px-4 text-right">SALE AMOUNT</th>
              <th className="py-3 px-4 text-right">TOTAL COST</th>
              <th className="py-3 px-4 text-right">NET PROFIT</th>
              <th className="py-3 px-4">PAYMENT METHOD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {filteredSales.map((sale) => {
              const veh = state.vehicles.find((v) => v.id === sale.vehicleId);
              return (
                <tr key={sale.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">
                      {veh
                        ? `${veh.year} ${veh.make} ${veh.model} ${veh.trim}`
                        : sale.vehicleId}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {veh ? `${veh.stockId} · VIN: ${veh.vin}` : ''}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">
                      {sale.buyerName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {sale.buyerPhone}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                    {sale.saleDate}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                    {fmtMoney(sale.saleAmount)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                    {fmtMoney(sale.totalCostSnapshot, true)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-emerald-600">
                    {fmtMoney(sale.netProfitSnapshot, true)}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-700">
                    {sale.paymentMethod}
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

export const ClientsView: React.FC = () => {
  const {
    state,
    openModal,
    updateClientStage,
    addClientInteraction,
    addClientDocument,
    removeClientDocument,
    toggleVerifyClientDocument,
    fmtMoney,
    canMutate,
    showToast,
    selectedClientId: contextSelectedClientId,
    setSelectedClientId: setContextSelectedClientId,
  } = useDealership();

  const [viewMode, setViewMode] = useState<'board' | 'split'>('board');
  const [stageTab, setStageTab] = useState<'ALL' | CrmStage>('ALL');
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientIdState] = useState<string>(
    contextSelectedClientId || state.clients[0]?.id || ''
  );

  const setSelectedClientId = (id: string) => {
    setSelectedClientIdState(id);
    setContextSelectedClientId(id);
  };

  useEffect(() => {
    if (
      contextSelectedClientId &&
      contextSelectedClientId !== selectedClientId &&
      state.clients.some((c) => c.id === contextSelectedClientId)
    ) {
      setSelectedClientIdState(contextSelectedClientId);
      setStageTab('ALL');
    }
  }, [contextSelectedClientId, selectedClientId, state.clients]);

  const [noteInput, setNoteInput] = useState('');
  const [noteType, setNoteType] = useState<
    'Call' | 'WhatsApp' | 'Test Drive' | 'Offer' | 'Note'
  >('Call');
  const [dragOverStage, setDragOverStage] = useState<CrmStage | null>(null);
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null);

  // Secure Document Upload & Local Object URL state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [docCategory, setDocCategory] =
    useState<ClientDocumentCategory>('Driver License');
  const [docSecurityNote, setDocSecurityNote] = useState<string>('');
  const [isDocDragOver, setIsDocDragOver] = useState<boolean>(false);
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null);

  // Revoke any session-created blob URLs on unmount if needed
  const createdBlobUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      createdBlobUrlsRef.current.forEach((url) => {
        if (
          url.startsWith('blob:') &&
          typeof URL !== 'undefined' &&
          typeof URL.revokeObjectURL === 'function'
        ) {
          try {
            URL.revokeObjectURL(url);
          } catch (_e) {
            // ignore
          }
        }
      });
    };
  }, []);

  const stages: Array<{
    id: CrmStage;
    label: string;
    color: string;
    border: string;
    bg: string;
    badgeBg: string;
  }> = [
    {
      id: 'New lead',
      label: 'New Lead',
      color: 'text-indigo-700',
      border: 'border-indigo-200',
      bg: 'bg-indigo-50/40',
      badgeBg: 'bg-indigo-100 text-indigo-800',
    },
    {
      id: 'Contacted',
      label: 'Contacted',
      color: 'text-sky-700',
      border: 'border-sky-200',
      bg: 'bg-sky-50/40',
      badgeBg: 'bg-sky-100 text-sky-800',
    },
    {
      id: 'Viewing',
      label: 'Viewing',
      color: 'text-purple-700',
      border: 'border-purple-200',
      bg: 'bg-purple-50/40',
      badgeBg: 'bg-purple-100 text-purple-800',
    },
    {
      id: 'Negotiation',
      label: 'Negotiation',
      color: 'text-amber-700',
      border: 'border-amber-200',
      bg: 'bg-amber-50/40',
      badgeBg: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'Sold',
      label: 'Sold',
      color: 'text-emerald-700',
      border: 'border-emerald-200',
      bg: 'bg-emerald-50/40',
      badgeBg: 'bg-emerald-100 text-emerald-800',
    },
  ];

  const filteredClients = state.clients.filter((c) => {
    const matchesStage = stageTab === 'ALL' || c.stage === stageTab;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.request.toLowerCase().includes(q);
    return matchesStage && matchesSearch;
  });

  const activeClient =
    state.clients.find((c) => c.id === selectedClientId) || state.clients[0];
  const linkedVehicle = state.vehicles.find(
    (v) => v.id === activeClient?.vehicleId
  );

  const totalInteractions = state.clients.reduce(
    (s, c) => s + c.interactions.length,
    0
  );
  const totalStoredDocs = state.clients.reduce(
    (s, c) => s + (c.documents?.length || 0),
    0
  );

  const handleLogInteraction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !noteInput.trim()) return;
    addClientInteraction(activeClient.id, {
      author: state.settings.displayName,
      type: noteType,
      note: noteInput.trim(),
    });
    setNoteInput('');
  };

  // Process uploaded PDF or Image files into temporary local Object URLs
  const processUploadedFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || !activeClient || !canMutate) return;

    Array.from(files).forEach((file) => {
      const isPdfOrImage =
        file.type === 'application/pdf' ||
        file.type.startsWith('image/') ||
        /\.(pdf|png|jpe?g|webp|svg)$/i.test(file.name);

      if (!isPdfOrImage) {
        showToast(
          `Skipped "${file.name}" — only PDF and image files (PNG, JPG, WEBP, SVG) are permitted.`
        );
        return;
      }

      const objectUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : '';

      if (objectUrl.startsWith('blob:')) {
        createdBlobUrlsRef.current.push(objectUrl);
      }

      addClientDocument(activeClient.id, {
        name: file.name,
        category: docCategory,
        mimeType:
          file.type ||
          (file.name.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg'),
        sizeBytes: file.size || 24500,
        objectUrl,
        verified: true,
        isSessionObjectUrl: true,
        securityNote:
          docSecurityNote.trim() ||
          `Temporary local Object URL (${file.type || 'document'}) scoped to current browser session.`,
      });
    });

    setDocSecurityNote('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateInstantKycBlob = () => {
    if (!activeClient || !canMutate) return;
    const generated = createLocalKycDocumentBlobUrl({
      clientName: activeClient.name,
      category: docCategory,
    });
    if (generated.objectUrl.startsWith('blob:')) {
      createdBlobUrlsRef.current.push(generated.objectUrl);
    }
    addClientDocument(activeClient.id, {
      name: generated.fileName,
      category: docCategory,
      mimeType: generated.mimeType,
      sizeBytes: generated.sizeBytes,
      objectUrl: generated.objectUrl,
      verified: true,
      isSessionObjectUrl: true,
      securityNote:
        docSecurityNote.trim() ||
        `Synthesized local Blob via URL.createObjectURL for ${activeClient.name} (${docCategory}).`,
    });
    setDocSecurityNote('');
  };

  const [isClientCameraOpen, setIsClientCameraOpen] = useState(false);
  const [clientCameraDefaultType, setClientCameraDefaultType] = useState<
    'Vehicle Title' | 'Service Invoice'
  >('Vehicle Title');

  const handleSaveClientCameraScan = (scan: CameraScannerCapturePayload) => {
    if (!activeClient || !canMutate) return;
    if (scan.objectUrl.startsWith('blob:')) {
      createdBlobUrlsRef.current.push(scan.objectUrl);
    }
    const mappedCategory: ClientDocumentCategory =
      scan.docType === 'Vehicle Title'
        ? 'Trade-In Title'
        : 'Bill of Sale / Contract';

    addClientDocument(activeClient.id, {
      name: scan.fileName,
      category: mappedCategory,
      mimeType: scan.mimeType,
      sizeBytes: scan.sizeBytes,
      objectUrl: scan.objectUrl,
      verified: true,
      isSessionObjectUrl: true,
      securityNote: `Camera Scan [${scan.docType} #${scan.referenceCode}]: ${scan.primaryTitle} (${scan.vinOrSku}) — ${scan.amountText}. ${scan.notes}`,
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Drag and drop handlers for Kanban board
  const handleDragStart = (e: React.DragEvent, clientId: string) => {
    if (!canMutate) return;
    e.dataTransfer.setData('text/plain', clientId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedClientId(clientId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: CrmStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) {
      setDragOverStage(stageId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: CrmStage) => {
    e.preventDefault();
    const clientId = e.dataTransfer.getData('text/plain') || draggedClientId;
    if (clientId && canMutate) {
      updateClientStage(clientId, targetStage);
    }
    setDragOverStage(null);
    setDraggedClientId(null);
  };

  // Helper for interaction type icon and styling
  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'Call':
        return <Phone className="w-3.5 h-3.5 text-blue-600" />;
      case 'WhatsApp':
        return <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />;
      case 'Test Drive':
        return <Car className="w-3.5 h-3.5 text-purple-600" />;
      case 'Offer':
        return <DollarSign className="w-3.5 h-3.5 text-amber-600" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-600" />;
    }
  };

  // Reusable Secure Client Document Vault section rendered for activeClient
  const renderClientDocumentVault = () => {
    if (!activeClient) return null;
    const clientDocs = activeClient.documents || [];

    return (
      <div
        id="client-document-vault"
        className="bg-slate-50/80 rounded-lg border border-slate-200 p-4 space-y-4"
      >
        {/* Vault Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Secure Client Document Vault ({clientDocs.length})
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Local Object URL Storage</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Attach PDF or image files (Driver&apos;s License, Proof of Insurance, Credit App) via temporary browser-scoped <code className="font-mono text-slate-700">URL.createObjectURL</code> references
              </p>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-500">
            Verified:{' '}
            <strong className="text-emerald-700">
              {clientDocs.filter((d) => d.verified).length}/{clientDocs.length}
            </strong>
          </div>
        </div>

        {/* Upload Dropzone & Controls */}
        {canMutate && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            {/* Left: Category & Note Inputs (5 cols) */}
            <div className="lg:col-span-5 bg-white p-3 rounded-lg border border-slate-200 space-y-2.5 text-xs">
              <div>
                <label
                  htmlFor="doc-category-select"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Document Type / Category
                </label>
                <select
                  id="doc-category-select"
                  value={docCategory}
                  onChange={(e) =>
                    setDocCategory(e.target.value as ClientDocumentCategory)
                  }
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white font-semibold text-slate-800"
                >
                  <option value="Driver License">Driver&apos;s License / State ID</option>
                  <option value="Proof of Insurance">
                    Proof of Insurance Binder
                  </option>
                  <option value="Credit Application">
                    Signed Credit Application
                  </option>
                  <option value="Bill of Sale / Contract">
                    Bill of Sale / Retail Contract
                  </option>
                  <option value="Trade-In Title">
                    Trade-In Title &amp; Registration
                  </option>
                  <option value="Other">Other Dealership KYC File</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="doc-security-note"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Verification / Policy Note (Optional)
                </label>
                <input
                  id="doc-security-note"
                  type="text"
                  value={docSecurityNote}
                  onChange={(e) => setDocSecurityNote(e.target.value)}
                  placeholder="e.g., Policy #PRG-99210 or TX DL verified for test drive..."
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateInstantKycBlob}
                className="w-full py-1.5 px-3 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileCheck className="w-3.5 h-3.5 text-[#f17832]" />
                <span>+ Generate Verified KYC Blob ({docCategory})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setClientCameraDefaultType('Vehicle Title');
                  setIsClientCameraOpen(true);
                }}
                className="w-full py-1.5 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Camera className="w-3.5 h-3.5 text-[#f17832]" />
                <span>📷 Scan Title / Invoice (Camera)</span>
              </button>
            </div>

            {/* Right: Drag-and-Drop PDF / Image File Dropzone (7 cols) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDocDragOver(true);
              }}
              onDragLeave={() => setIsDocDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDocDragOver(false);
                processUploadedFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`lg:col-span-7 rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDocDragOver
                  ? 'border-[#f17832] bg-orange-50/60'
                  : 'border-slate-300 bg-white hover:border-[#f17832] hover:bg-slate-50/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
                multiple
                onChange={(e) => processUploadedFiles(e.target.files)}
                aria-label="Upload client PDF or image document"
                className="hidden"
              />
              <div className="w-9 h-9 rounded-full bg-orange-100 text-[#f17832] flex items-center justify-center mb-2">
                <Upload className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-slate-900">
                Click to Upload or Drag &amp; Drop PDF / Image Files
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-md">
                Supports <strong className="text-slate-700">PDF, PNG, JPG, WEBP, SVG</strong>. Files are converted into temporary session-scoped <code className="font-mono text-[#f17832]">blob:</code> Object URLs for zero-cloud PII handling.
              </p>
              <span
                style={{ backgroundColor: state.settings.accentColor }}
                className="mt-2.5 px-3 py-1 rounded text-[11px] font-semibold text-white inline-flex items-center gap-1.5"
              >
                <Upload className="w-3 h-3" />
                <span>Select PDF or Image for {activeClient.name}</span>
              </span>
            </div>
          </div>
        )}

        {/* Attached Documents List */}
        {clientDocs.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
            No KYC or insurance documents attached to{' '}
            <strong className="text-slate-800">{activeClient.name}</strong> yet.
            Upload a PDF/image above or click{' '}
            <strong className="text-slate-800">
              + Generate Verified KYC Blob
            </strong>{' '}
            to attach a local session document.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clientDocs.map((doc) => {
              const isPdf =
                doc.mimeType === 'application/pdf' ||
                doc.name.toLowerCase().endsWith('.pdf');
              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col justify-between gap-2.5 shadow-2xs hover:border-slate-300 transition-all text-xs"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border ${
                          isPdf
                            ? 'bg-rose-50 border-rose-200 text-rose-600'
                            : 'bg-blue-50 border-blue-200 text-blue-600'
                        }`}
                      >
                        {isPdf ? (
                          <FileText className="w-4 h-4" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                            {doc.category}
                          </span>
                          {doc.verified ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Verified KYC</span>
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Pending Review
                            </span>
                          )}
                        </div>
                        <div
                          className="font-bold text-slate-900 truncate mt-1"
                          title={doc.name}
                        >
                          {doc.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {formatFileSize(doc.sizeBytes)} · {doc.uploadedAt} ·{' '}
                          {doc.uploadedBy}
                        </div>
                      </div>
                    </div>
                  </div>

                  {doc.securityNote && (
                    <div className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-100">
                      {doc.securityNote}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <span
                      className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]"
                      title={doc.objectUrl}
                    >
                      {doc.objectUrl.startsWith('blob:')
                        ? doc.objectUrl
                        : `local-obj://${doc.id}`}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="px-2.5 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3 text-[#f17832]" />
                        <span>Inspect</span>
                      </button>

                      {canMutate && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              toggleVerifyClientDocument(activeClient.id, doc.id)
                            }
                            className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600"
                          >
                            {doc.verified ? 'Unverify' : 'Verify'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              removeClientDocument(activeClient.id, doc.id)
                            }
                            title="Revoke temporary Object URL and purge document"
                            className="px-2 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Revoke</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Clients &amp; CRM Pipeline
          </h1>
          <p className="text-xs text-slate-500">
            Drag-and-drop buyer stages, secure local Object URL KYC document storage, and interaction timelines
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle: Board vs Split */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'board'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5 text-[#f17832]" />
              <span>Pipeline Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'split'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Split Inspector</span>
            </button>
          </div>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => {
              setClientCameraDefaultType('Vehicle Title');
              setIsClientCameraOpen(true);
            }}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-[#f17832]" />
            <span>📷 Scan Title / Invoice</span>
          </button>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('add_client')}
            style={{ backgroundColor: state.settings.accentColor }}
            className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add client</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-white rounded-lg border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center gap-6 text-slate-600 font-mono tabular-nums">
          <span>
            Active buyer deals:{' '}
            <strong className="text-slate-900">
              {state.clients.filter((c) => c.stage !== 'Sold').length}
            </strong>
          </span>
          <span>·</span>
          <span>
            Overdue follow-ups:{' '}
            <strong className="text-rose-600">
              {state.clients.filter((c) => c.isOverdue && c.stage !== 'Sold').length}
            </strong>
          </span>
          <span>·</span>
          <span>
            Logged interactions:{' '}
            <strong className="text-slate-900">{totalInteractions}</strong>
          </span>
          <span>·</span>
          <span>
            KYC Documents (Object URLs):{' '}
            <strong className="text-emerald-700">{totalStoredDocs}</strong>
          </span>
          <span>·</span>
          <span>
            Pipeline deal value:{' '}
            <strong className="text-emerald-700">
              {fmtMoney(
                state.clients
                  .filter((c) => c.stage !== 'Sold')
                  .reduce((sum, c) => {
                    const v = state.vehicles.find((veh) => veh.id === c.vehicleId);
                    return sum + (v ? v.askingPrice : 0);
                  }, 0)
              )}
            </strong>
          </span>
        </div>

        {/* Global Client Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, phone, car..."
            className="w-full pl-8 pr-3 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white"
          />
        </div>
      </div>

      {/* VIEW 1: DRAG-AND-DROP PIPELINE BOARD */}
      {viewMode === 'board' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
            {stages.map((st) => {
              const stageClients = filteredClients.filter((c) => c.stage === st.id);
              const stageValue = stageClients.reduce((sum, c) => {
                const v = state.vehicles.find((veh) => veh.id === c.vehicleId);
                return sum + (v ? v.askingPrice : 0);
              }, 0);
              const isOver = dragOverStage === st.id;

              return (
                <div
                  key={st.id}
                  onDragOver={(e) => handleDragOver(e, st.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, st.id)}
                  className={`rounded-lg border bg-white flex flex-col min-h-[220px] lg:min-h-[540px] transition-all ${
                    isOver
                      ? 'border-2 border-dashed border-[#f17832] bg-orange-50/40 shadow-md'
                      : `${st.border}`
                  }`}
                >
                  {/* Column Header */}
                  <div className={`p-3.5 border-b ${st.border} ${st.bg} rounded-t-lg`}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${st.color}`}>
                          {st.label}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold font-mono ${st.badgeBg}`}
                        >
                          {stageClients.length}
                        </span>
                      </div>
                      {canMutate && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          Drop here
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      Value: {fmtMoney(stageValue)}
                    </div>
                  </div>

                  {/* Column Lead Cards List */}
                  <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[680px]">
                    {stageClients.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md">
                        {isOver ? 'Drop lead here to change status' : 'No leads in this stage'}
                      </div>
                    ) : (
                      stageClients.map((client) => {
                        const veh = state.vehicles.find((v) => v.id === client.vehicleId);
                        const isSelected = activeClient?.id === client.id;
                        const lastInteraction =
                          client.interactions[client.interactions.length - 1];
                        const docCount = client.documents?.length || 0;

                        return (
                          <div
                            key={client.id}
                            draggable={canMutate}
                            onDragStart={(e) => handleDragStart(e, client.id)}
                            onClick={() => setSelectedClientId(client.id)}
                            className={`p-3 rounded-lg border bg-white shadow-xs hover:shadow-sm cursor-grab active:cursor-grabbing transition-all space-y-2 ${
                              isSelected
                                ? 'border-[#f17832] ring-1 ring-[#f17832]'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                                  <GripVertical className="w-3 h-3 text-slate-300 shrink-0" />
                                  <span>{client.name}</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 pl-4">
                                  {client.phone}
                                </div>
                              </div>

                              {client.isOverdue && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 whitespace-nowrap">
                                  Overdue
                                </span>
                              )}
                            </div>

                            {/* Vehicle of Interest */}
                            {veh ? (
                              <div className="p-2 rounded bg-slate-50 border border-slate-100 flex items-center gap-2">
                                <VehiclePhoto
                                  src={veh.coverPhoto}
                                  alt={veh.model}
                                  className="w-9 h-7 rounded object-cover"
                                />
                                <div className="min-w-0 text-[11px]">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {veh.year} {veh.make} {veh.model}
                                  </div>
                                  <div className="text-slate-500 font-mono">
                                    {veh.stockId} · {fmtMoney(veh.askingPrice)}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 truncate italic">
                                {client.request || 'General vehicle search'}
                              </div>
                            )}

                            {/* Last Interaction Snippet */}
                            {lastInteraction && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1 border-t border-slate-100 truncate">
                                {getInteractionIcon(lastInteraction.type)}
                                <span className="truncate">
                                  {lastInteraction.type}: {lastInteraction.note}
                                </span>
                              </div>
                            )}

                            {/* Card Footer */}
                            <div className="flex items-center justify-between pt-1 text-[11px]">
                              <div className="flex items-center gap-2 font-mono text-slate-400">
                                <span>{client.interactions.length} updates</span>
                                {docCount > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                    {docCount} doc{docCount === 1 ? '' : 's'}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedClientId(client.id);
                                }}
                                className="font-semibold text-[#f17832] hover:underline"
                              >
                                Vault &amp; Timeline →
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expanded Profile, Secure Document Vault & Timeline Panel for Selected Lead in Board View */}
          {activeClient && (
            <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      {activeClient.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-[#f17832]">
                      Stage: {activeClient.stage}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {activeClient.phone} · {activeClient.email}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${activeClient.phone}`}
                    className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    <span>Call</span>
                  </a>

                  <a
                    href={`https://wa.me/${activeClient.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Hi ${activeClient.name}, following up from ${state.settings.dealershipName} regarding your inquiry.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>

              {/* Visual Pipeline Milestone Stage Stepper */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Pipeline Stage Milestone Stepper (Click to advance lead)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {stages.map((st, idx) => {
                    const currentIdx = stages.findIndex((s) => s.id === activeClient.stage);
                    const isPassed = idx < currentIdx;
                    const isCurrent = st.id === activeClient.stage;

                    return (
                      <button
                        key={st.id}
                        type="button"
                        disabled={!canMutate}
                        onClick={() => updateClientStage(activeClient.id, st.id)}
                        className={`p-2.5 rounded-md border text-left transition-all ${
                          isCurrent
                            ? 'border-[#f17832] bg-white ring-2 ring-[#f17832]/30 shadow-xs'
                            : isPassed
                            ? 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span
                            className={
                              isCurrent
                                ? 'text-[#f17832]'
                                : isPassed
                                ? 'text-emerald-700'
                                : 'text-slate-700'
                            }
                          >
                            {idx + 1}. {st.label}
                          </span>
                          {isPassed && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          {isCurrent && (
                            <span className="w-2 h-2 rounded-full bg-[#f17832] animate-pulse" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Secure Document Upload & Storage Vault */}
              {renderClientDocumentVault()}

              {/* Visual Interaction History Timeline */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>
                      Interaction History Timeline ({activeClient.interactions.length})
                    </span>
                  </h3>
                </div>

                {/* Quick-Log Toolbar and Form */}
                {canMutate && (
                  <form onSubmit={handleLogInteraction} className="space-y-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-500 font-semibold mr-1">
                        Quick Log:
                      </span>
                      {(['Call', 'WhatsApp', 'Test Drive', 'Offer', 'Note'] as const).map(
                        (t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setNoteType(t)}
                            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 border transition-colors ${
                              noteType === t
                                ? 'bg-white border-[#f17832] text-[#f17832] font-semibold shadow-xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {getInteractionIcon(t)}
                            <span>{t}</span>
                          </button>
                        )
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder={`Log ${noteType} details, counter-offer, or feedback...`}
                        className="flex-1 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white"
                      />
                      <button
                        type="submit"
                        style={{ backgroundColor: state.settings.accentColor }}
                        className="px-4 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Log {noteType}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Vertical Continuous Timeline Component */}
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {activeClient.interactions.map((int, i) => (
                    <div key={int.id || i} className="relative flex items-start gap-3 group">
                      {/* Timeline Node Icon */}
                      <div className="absolute -left-6 mt-0.5 w-5 h-5 rounded-full bg-white border border-slate-300 shadow-xs flex items-center justify-center shrink-0">
                        {getInteractionIcon(int.type)}
                      </div>

                      {/* Timeline Card */}
                      <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200 space-y-1 shadow-xs hover:border-slate-300 transition-colors">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-bold font-sans text-slate-900 flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px]">
                              {int.type}
                            </span>
                            <span>{int.author}</span>
                          </span>
                          <span className="text-slate-400">{int.date}</span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed font-sans">
                          {int.note}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SPLIT MASTER-DETAIL INSPECTOR */}
      {viewMode === 'split' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Pane: Lead List (5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-100 flex items-center gap-1 overflow-x-auto">
              {(['ALL', 'New lead', 'Contacted', 'Viewing', 'Negotiation', 'Sold'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStageTab(st as any)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                      stageTab === st
                        ? 'bg-[#18181b] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st}
                  </button>
                )
              )}
            </div>

            <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
              {filteredClients.map((cli) => {
                const veh = state.vehicles.find((v) => v.id === cli.vehicleId);
                const isSelected = activeClient?.id === cli.id;
                const docCount = cli.documents?.length || 0;
                return (
                  <div
                    key={cli.id}
                    draggable={canMutate}
                    onDragStart={(e) => handleDragStart(e, cli.id)}
                    onClick={() => setSelectedClientId(cli.id)}
                    className={`w-full p-4 text-left transition-colors cursor-pointer hover:bg-slate-50 ${
                      isSelected ? 'bg-orange-50/60 border-l-4 border-[#f17832]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900 flex items-center gap-1">
                        <GripVertical className="w-3 h-3 text-slate-300" />
                        <span>{cli.name}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {docCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                            {docCount} doc{docCount === 1 ? '' : 's'}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-[#f17832]">
                          {cli.stage}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-600 mt-1 truncate pl-4">
                      {veh
                        ? `Interested in: ${veh.year} ${veh.make} ${veh.model} (${veh.stockId})`
                        : cli.request}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400 pl-4">
                      <span>{cli.phone}</span>
                      <span className={cli.isOverdue ? 'text-rose-600 font-bold' : ''}>
                        {cli.isOverdue
                          ? `Overdue (${cli.preferredContactDate})`
                          : `Next: ${cli.preferredContactDate}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Selected Client Detail, Secure Document Vault & Timeline (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 p-5 space-y-5">
            {activeClient ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {activeClient.name}
                    </h2>
                    <div className="text-xs text-slate-500 font-mono">
                      {activeClient.phone} · {activeClient.email}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={activeClient.stage}
                      disabled={!canMutate}
                      onChange={(e) =>
                        updateClientStage(activeClient.id, e.target.value as CrmStage)
                      }
                      aria-label="Client Pipeline Stage"
                      className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs font-semibold bg-white"
                    >
                      {(
                        [
                          'New lead',
                          'Contacted',
                          'Viewing',
                          'Negotiation',
                          'Sold',
                        ] as CrmStage[]
                      ).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    <a
                      href={`tel:${activeClient.phone}`}
                      className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-blue-600" />
                      <span>Call</span>
                    </a>

                    <a
                      href={`https://wa.me/${activeClient.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Hi ${activeClient.name}, following up from ${state.settings.dealershipName} regarding your inquiry.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>

                {/* Linked Vehicle Card & Reminder */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Vehicle of Interest
                    </div>
                    {linkedVehicle ? (
                      <div className="mt-1">
                        <div className="font-bold text-slate-900">
                          {linkedVehicle.year} {linkedVehicle.make}{' '}
                          {linkedVehicle.model} {linkedVehicle.trim}
                        </div>
                        <div className="text-slate-500 font-mono">
                          {linkedVehicle.stockId} · Asking{' '}
                          {fmtMoney(linkedVehicle.askingPrice)}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-slate-500">
                        General Inventory Inquiry
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Preferred Contact Reminder
                    </div>
                    <div
                      className={`mt-1 font-mono font-bold ${
                        activeClient.isOverdue ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {activeClient.preferredContactDate}{' '}
                      {activeClient.isOverdue ? '(OVERDUE)' : '(Scheduled)'}
                    </div>
                    <div className="text-slate-500 truncate mt-0.5">
                      {activeClient.notes}
                    </div>
                  </div>
                </div>

                {/* Milestone Stepper in Split View */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Pipeline Stepper
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {stages.map((st, idx) => {
                      const currentIdx = stages.findIndex((s) => s.id === activeClient.stage);
                      const isPassed = idx < currentIdx;
                      const isCurrent = st.id === activeClient.stage;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          disabled={!canMutate}
                          onClick={() => updateClientStage(activeClient.id, st.id)}
                          className={`py-1.5 px-2 rounded text-center text-[10px] font-bold transition-all ${
                            isCurrent
                              ? 'bg-[#18181b] text-white shadow-xs'
                              : isPassed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-white border border-slate-200 text-slate-600'
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Secure Client Document Vault in Split View */}
                {renderClientDocumentVault()}

                {/* Timeline in Split View */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      Interaction History Timeline ({activeClient.interactions.length})
                    </span>
                  </h3>

                  {canMutate && (
                    <form
                      onSubmit={handleLogInteraction}
                      className="flex flex-col sm:flex-row gap-2"
                    >
                      <select
                        value={noteType}
                        onChange={(e) => setNoteType(e.target.value as any)}
                        aria-label="Interaction type"
                        className="px-2.5 py-2 rounded-md border border-slate-200 text-xs bg-white"
                      >
                        <option value="Call">Call</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Test Drive">Test Drive</option>
                        <option value="Offer">Offer</option>
                        <option value="Note">Note</option>
                      </select>
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Log call outcome, test-drive feedback, or counter-offer..."
                        className="flex-1 px-3 py-2 text-xs rounded-md border border-slate-200"
                      />
                      <button
                        type="submit"
                        style={{ backgroundColor: state.settings.accentColor }}
                        className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Log Note</span>
                      </button>
                    </form>
                  )}

                  <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 max-h-72 overflow-y-auto">
                    {activeClient.interactions.map((int, i) => (
                      <div key={int.id || i} className="relative flex items-start gap-3">
                        <div className="absolute -left-6 mt-0.5 w-5 h-5 rounded-full bg-white border border-slate-300 shadow-xs flex items-center justify-center shrink-0">
                          {getInteractionIcon(int.type)}
                        </div>
                        <div className="flex-1 p-2.5 rounded-lg border border-slate-200 bg-white space-y-1 text-xs">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                            <span className="font-semibold text-slate-800 font-sans">
                              {int.type} · {int.author}
                            </span>
                            <span>{int.date}</span>
                          </div>
                          <p className="text-slate-700">{int.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Select a client lead from the left pane to inspect details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECURE DOCUMENT PREVIEW LIGHTBOX MODAL */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#18181b] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">
                    {previewDoc.name}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    {previewDoc.category} · {formatFileSize(previewDoc.sizeBytes)} · Uploaded by {previewDoc.uploadedBy}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                aria-label="Close document preview"
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-900 text-zinc-200 font-mono text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="truncate">
                  <span className="text-emerald-400 font-bold">
                    OBJECT URL:
                  </span>{' '}
                  {previewDoc.objectUrl}
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  Session Memory Isolated
                </span>
              </div>

              {previewDoc.mimeType.startsWith('image/') &&
              (previewDoc.objectUrl.startsWith('blob:') ||
                previewDoc.objectUrl.startsWith('data:') ||
                previewDoc.objectUrl.startsWith('/')) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 flex items-center justify-center">
                  <img
                    src={previewDoc.objectUrl}
                    alt={previewDoc.name}
                    className="max-h-80 rounded object-contain mx-auto"
                  />
                </div>
              ) : previewDoc.mimeType === 'application/pdf' &&
                previewDoc.objectUrl.startsWith('blob:http') ? (
                <iframe
                  src={previewDoc.objectUrl}
                  title={previewDoc.name}
                  className="w-full h-80 rounded-lg border border-slate-200"
                />
              ) : (
                <div className="p-6 rounded-lg border border-slate-200 bg-slate-50 text-center space-y-2">
                  <FileText className="w-8 h-8 text-[#f17832] mx-auto" />
                  <div className="text-sm font-bold text-slate-900">
                    {previewDoc.name} ({previewDoc.category})
                  </div>
                  <p className="text-xs text-slate-600 max-w-md mx-auto">
                    {previewDoc.securityNote ||
                      'Verified KYC record stored via temporary browser Object URL.'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <div className="text-[11px] text-slate-500">
                  Status:{' '}
                  <strong
                    className={
                      previewDoc.verified
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                  >
                    {previewDoc.verified ? 'Verified KYC' : 'Pending Review'}
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  {(previewDoc.objectUrl.startsWith('blob:http') ||
                    previewDoc.objectUrl.startsWith('data:') ||
                    previewDoc.objectUrl.startsWith('/')) && (
                    <a
                      href={previewDoc.objectUrl}
                      download={previewDoc.name}
                      className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-800 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Local Copy</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    style={{ backgroundColor: state.settings.accentColor }}
                    className="px-4 py-1.5 rounded-md font-semibold text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT CAMERA SCANNER MODAL FOR CLIENT TITLES & INVOICES */}
      {activeClient && (
        <CameraDocumentScannerModal
          isOpen={isClientCameraOpen}
          onClose={() => setIsClientCameraOpen(false)}
          defaultDocType={clientCameraDefaultType}
          targetContextLabel={`Client Profile: ${activeClient.name}`}
          defaultCounterpartyOrVendor={activeClient.name}
          defaultVinOrSku={
            linkedVehicle ? linkedVehicle.vin : '1HGCV1F34LA019284'
          }
          defaultPrimaryTitle={
            linkedVehicle
              ? `${linkedVehicle.year} ${linkedVehicle.make} ${linkedVehicle.model} Title`
              : '2018 Ford F-150 XLT Trade-In Certificate of Title'
          }
          defaultAmountText={
            linkedVehicle ? fmtMoney(linkedVehicle.askingPrice) : '$14,500.00'
          }
          onCaptureSave={handleSaveClientCameraScan}
        />
      )}
    </div>
  );
};

export const PartsView: React.FC = () => {
  const {
    state,
    openModal,
    fmtMoney,
    canMutate,
    addPartStock,
    attachScanToPartBatch,
    batchImportPartsCsv,
    createReorderRequest,
    receiveReorderRequest,
    deleteReorderRequest,
    showToast,
  } = useDealership();

  const [partsTab, setPartsTab] = useState<
    'inventory' | 'alerts' | 'purchase_orders'
  >('inventory');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPartsCameraOpen, setIsPartsCameraOpen] = useState(false);
  const [targetScanBatch, setTargetScanBatch] = useState<PartBatch | null>(null);
  const [previewBatchScan, setPreviewBatchScan] = useState<PartBatch | null>(
    null
  );
  const [csvRawText, setCsvRawText] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(
    state.accounts[0]?.id || 'acc-bank'
  );
  const [recordLedgerOutflow, setRecordLedgerOutflow] = useState(true);
  const [parsedResult, setParsedResult] = useState<
    ReturnType<typeof parsePartsCsvText>
  >({
    items: [],
    errors: [],
    totalParsed: 0,
    totalValid: 0,
  });

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const lowStockAlerts = getLowStockPartAlerts(state);
  const reorderRequests = state.reorderRequests || [];
  const activeOrdersCount = reorderRequests.filter(
    (r) => r.status === 'Ordered'
  ).length;

  const totalUnitsInStock = state.partBatches.reduce(
    (s, b) => s + b.remainingQty,
    0
  );
  const totalFifoStockValue = state.partBatches.reduce(
    (s, b) => s + b.remainingQty * b.unitCost,
    0
  );

  const lowStockCount = state.parts.filter((p) => {
    const qty = state.partBatches
      .filter((b) => b.partId === p.id)
      .reduce((s, b) => s + b.remainingQty, 0);
    return qty <= 2;
  }).length;

  const partSalesRevenue = state.partSales.reduce(
    (s, ps) => s + ps.totalRevenue,
    0
  );
  const partSalesFifoCost = state.partSales.reduce(
    (s, ps) => s + ps.fifoCost,
    0
  );
  const partSalesGrossProfit = state.partSales.reduce(
    (s, ps) => s + ps.grossProfit,
    0
  );

  const handleProcessCsvText = (text: string) => {
    setCsvRawText(text);
    const parsed = parsePartsCsvText(text);
    setParsedResult(parsed);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      handleProcessCsvText(content);
    };
    reader.readAsText(file);
    // reset input so same file can be re-selected if needed
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = (event.target?.result as string) || '';
        handleProcessCsvText(content);
      };
      reader.readAsText(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_PARTS_CSV_TEMPLATE], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_parts_fifo_inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded sample parts CSV template.');
  };

  const handleLoadSample = () => {
    handleProcessCsvText(SAMPLE_PARTS_CSV_TEMPLATE);
    showToast('Loaded sample CSV data into preview.');
  };

  const handleConfirmBatchImport = () => {
    if (!canMutate) {
      showToast('Your active role does not have permission to import inventory.');
      return;
    }
    if (parsedResult.items.length === 0) {
      showToast('No valid parts found to import.');
      return;
    }

    const summary = batchImportPartsCsv(
      parsedResult.items,
      selectedAccountId,
      recordLedgerOutflow
    );

    showToast(
      `Imported ${summary.importedBatchesCount} FIFO batches (${summary.totalUnits} units, ${fmtMoney(
        summary.totalSpend
      )})!`
    );

    setIsImportModalOpen(false);
    setCsvRawText('');
    setParsedResult({ items: [], errors: [], totalParsed: 0, totalValid: 0 });
  };

  const previewTotalUnits = parsedResult.items.reduce(
    (s, it) => s + it.quantity,
    0
  );
  const previewTotalCost = parsedResult.items.reduce(
    (s, it) => s + it.quantity * it.unitCost,
    0
  );

  const handleSavePartsCameraScan = (scan: CameraScannerCapturePayload) => {
    if (!canMutate) return;

    if (targetScanBatch) {
      attachScanToPartBatch(targetScanBatch.id, {
        invoiceScanUrl: scan.objectUrl,
        invoiceNumber: scan.referenceCode,
        vendorName: scan.counterpartyOrVendor,
        scanDocType: scan.docType,
      });
      setTargetScanBatch(null);
      return;
    }

    const cleanCode = (scan.vinOrSku || 'PRT-SCAN-01').trim().toUpperCase();
    const existingPart = state.parts.find(
      (p) => p.code.toUpperCase() === cleanCode
    );
    const qty = Math.max(1, scan.quantity || 6);
    const unitCost = Math.max(1, scan.unitCost || 52);

    addPartStock({
      existingPartId: existingPart?.id,
      name: scan.primaryTitle || 'Scanned OEM Service Part',
      code: cleanCode,
      category: scan.partCategory || 'Brakes',
      batchLabel: `SCAN-${scan.referenceCode.toUpperCase()}`,
      quantity: qty,
      unitCost,
      purchaseDate: new Date().toISOString().slice(0, 10),
      paidFromAccountId: state.accounts[0]?.id || 'acc-bank',
      invoiceScanUrl: scan.objectUrl,
      invoiceNumber: scan.referenceCode,
      vendorName: scan.counterpartyOrVendor,
      scanDocType: scan.docType,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Parts Inventory (FIFO Accounting)
          </h1>
          <p className="text-xs text-slate-500">
            First-In, First-Out batch cost tracking for vehicle reconditioning allocations, camera invoice scanning, and counter part sales
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Camera Invoice / Title Scanner Button */}
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => {
              setTargetScanBatch(null);
              setIsPartsCameraOpen(true);
            }}
            className="px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50 shadow-2xs"
          >
            <Camera className="w-3.5 h-3.5 text-[#f17832]" />
            <span>📷 Scan Invoice / Title</span>
          </button>

          {/* CSV Batch Import Button */}
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>📥 Batch Import CSV</span>
          </button>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('allocate_part')}
            className="px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Wrench className="w-3.5 h-3.5 text-[#f17832]" />
            <span>Allocate to Vehicle</span>
          </button>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('record_part_sale')}
            className="px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <PackagePlus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Record Part Sale</span>
          </button>

          <button
            type="button"
            disabled={!canMutate}
            onClick={() => openModal('add_part_stock')}
            style={{ backgroundColor: state.settings.accentColor }}
            className="px-3.5 py-2 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add stock</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Part Lines</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {state.parts.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Active SKUs tracked</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">
            Units in Stock
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {totalUnitsInStock}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Across {state.partBatches.length} FIFO batches
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">
            Stock Value (FIFO)
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {fmtMoney(totalFifoStockValue, true)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Exact remaining batch valuation
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-slate-500">
              Low Stock (Velocity Alert)
            </div>
            {lowStockAlerts.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-rose-600">
              {lowStockAlerts.length}
            </span>
            <span className="text-xs text-slate-500">
              breached safety stock
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPartsTab('alerts')}
            className="mt-1.5 text-[11px] font-semibold text-[#f17832] hover:underline flex items-center gap-1"
          >
            <span>Review Usage Alerts →</span>
          </button>
        </div>
      </div>

      {/* Summary Financial Bar */}
      <div className="bg-white px-5 py-3.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs font-mono tabular-nums">
        <div>
          <span className="font-sans text-slate-500">
            Total part-sales revenue:{' '}
          </span>
          <strong className="text-slate-900">{fmtMoney(partSalesRevenue)}</strong>
        </div>
        <div>
          <span className="font-sans text-slate-500">Recorded FIFO cost: </span>
          <strong className="text-slate-900">
            {fmtMoney(partSalesFifoCost, true)}
          </strong>
        </div>
        <div>
          <span className="font-sans text-slate-500">
            Recorded gross profit:{' '}
          </span>
          <strong className="text-emerald-600">
            {fmtMoney(partSalesGrossProfit, true)}
          </strong>
        </div>
      </div>

      {/* Parts Module Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setPartsTab('inventory')}
            className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap ${
              partsTab === 'inventory'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Active FIFO Stock</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-700/60 text-zinc-200 font-mono">
              {state.parts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPartsTab('alerts')}
            className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap ${
              partsTab === 'alerts'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>⚠️ Low Stock Usage Alerts</span>
            {lowStockAlerts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white font-mono">
                {lowStockAlerts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setPartsTab('purchase_orders')}
            className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap ${
              partsTab === 'purchase_orders'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Purchase Orders &amp; Restock</span>
            {activeOrdersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-mono">
                {activeOrdersCount}
              </span>
            )}
          </button>
        </div>

        {partsTab === 'alerts' && lowStockAlerts.length > 0 && (
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => {
              lowStockAlerts.forEach((a) => {
                if (!a.isPendingReorder) {
                  createReorderRequest(a.partId, a.suggestedReorderQty);
                }
              });
              showToast('Generated reorder requests for all low-stock parts!');
              setPartsTab('purchase_orders');
            }}
            className="px-3 py-1.5 rounded-md bg-[#f17832] hover:bg-[#dc621e] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Generate All Reorders ({lowStockAlerts.length})</span>
          </button>
        )}
      </div>

      {/* 1. Alerts Tab: Usage-Based Low Stock Alerts */}
      {partsTab === 'alerts' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-amber-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Historical Velocity &amp; Burn Rate Restock System</span>
              </div>
              <p className="text-amber-800 text-[11px] mt-0.5">
                Parts flagged automatically when remaining on-hand batches drop below lead-time safety stock based on monthly recon and counter consumption.
              </p>
            </div>
            <div className="font-mono text-xs font-semibold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded border border-amber-300 shrink-0">
              {lowStockAlerts.length} Restock Items Identified
            </div>
          </div>

          {lowStockAlerts.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-xs text-slate-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <div className="font-semibold text-slate-800 text-sm">
                All inventory items healthy!
              </div>
              <p className="mt-1">
                Every part has sufficient stock to cover current historical burn rates.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-xs">
              <table className="w-full min-w-[740px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">SKU / Code</th>
                    <th className="py-3 px-4">Part Name</th>
                    <th className="py-3 px-4 text-center">Stock Level</th>
                    <th className="py-3 px-4 text-center">Monthly Burn Rate</th>
                    <th className="py-3 px-4 text-center">Runout Days</th>
                    <th className="py-3 px-4 text-center">Safety Point</th>
                    <th className="py-3 px-4 text-right">Suggested PO Qty</th>
                    <th className="py-3 px-4 text-right">Est. Spend</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lowStockAlerts.map((alert) => (
                    <tr key={alert.partId} className="hover:bg-amber-50/40">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                        {alert.code}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{alert.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {alert.category}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-xs ${
                            alert.currentStock === 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {alert.currentStock} units
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-700">
                        ~{alert.monthlyBurnRate} / mo
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        <span
                          className={
                            alert.daysRemaining <= 5
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }
                        >
                          {alert.daysRemaining} days
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-600">
                        {alert.safetyStockThreshold} units
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        {alert.suggestedReorderQty} units
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                        {fmtMoney(alert.totalEstimatedCost)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {alert.isPendingReorder ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-100 text-blue-800 text-[11px] font-semibold">
                            <span>PO Active</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!canMutate}
                            onClick={() => {
                              createReorderRequest(
                                alert.partId,
                                alert.suggestedReorderQty
                              );
                              setPartsTab('purchase_orders');
                            }}
                            className="px-3 py-1.5 rounded-md bg-[#f17832] hover:bg-[#dc621e] text-white text-xs font-bold inline-flex items-center gap-1 shadow-2xs disabled:opacity-50 transition-colors"
                          >
                            <Zap className="w-3 h-3" />
                            <span>1-Click PO</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. Purchase Orders Tab: Generated Restock Requests */}
      {partsTab === 'purchase_orders' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-blue-950 flex items-center gap-1.5">
                <PackagePlus className="w-4 h-4 text-blue-600" />
                <span>Supplier Purchase Orders &amp; Restock Pipeline</span>
              </div>
              <p className="text-blue-800 text-[11px] mt-0.5">
                Review generated supplier reorder requests. When parts arrive, click &quot;Receive &amp; Add FIFO Batch&quot; to automatically add stock and reconcile the treasury ledger.
              </p>
            </div>
            <div className="font-mono text-xs font-semibold text-blue-900 bg-blue-100 px-2.5 py-1 rounded border border-blue-300 shrink-0">
              {reorderRequests.length} Total Purchase Requests
            </div>
          </div>

          {reorderRequests.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-xs text-slate-500">
              <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="font-semibold text-slate-800 text-sm">
                No Purchase Orders Generated Yet
              </div>
              <p className="mt-1">
                Generate reorders from the Usage Alerts tab or by reviewing low-stock items.
              </p>
              <button
                type="button"
                onClick={() => setPartsTab('alerts')}
                className="mt-3 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                Inspect Low-Stock Alerts ({lowStockAlerts.length})
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-xs">
              <table className="w-full min-w-[720px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">PO # / Date</th>
                    <th className="py-3 px-4">Part / SKU</th>
                    <th className="py-3 px-4 text-right">Order Qty</th>
                    <th className="py-3 px-4 text-right">Est. Unit Cost</th>
                    <th className="py-3 px-4 text-right">Total Est. Spend</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reorderRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                        <div>{req.id.toUpperCase()}</div>
                        <div className="text-[11px] text-slate-500 font-normal">
                          {req.createdAt}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{req.partName}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {req.partCode} · {req.category}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        {req.suggestedQty} units
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                        {fmtMoney(req.estimatedUnitCost, true)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                        {fmtMoney(req.totalEstimatedCost)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            req.status === 'Received'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {req.status === 'Received' ? 'Received (In Stock)' : 'Ordered'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 text-[11px] max-w-xs truncate">
                        {req.supplierNotes || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {req.status !== 'Received' ? (
                            <button
                              type="button"
                              disabled={!canMutate}
                              onClick={() => receiveReorderRequest(req.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow-2xs disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Receive Stock</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Batched</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteReorderRequest(req.id)}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            title="Dismiss PO"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Inventory Tab: Parts & FIFO Batch Table */}
      {partsTab === 'inventory' && (
        <div className="space-y-3">
          {/* Low Stock Alert Toast Prompt */}
          {lowStockAlerts.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Usage Alert:</strong> {lowStockAlerts.length} part line{lowStockAlerts.length === 1 ? '' : 's'} have fallen below safe inventory thresholds based on recent consumption.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPartsTab('alerts')}
                className="font-bold text-[#f17832] hover:underline whitespace-nowrap ml-2"
              >
                Review Alerts &amp; Reorder →
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left border-collapse">
              <thead>
                <tr className="bg-[#18181b] text-zinc-200 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">SKU / CODE</th>
                  <th className="py-3 px-4">PART NAME &amp; CATEGORY</th>
                  <th className="py-3 px-4">ACTIVE FIFO BATCHES (OLDEST FIRST)</th>
                  <th className="py-3 px-4 text-right">TOTAL QTY</th>
                  <th className="py-3 px-4 text-right">FIFO VALUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {state.parts.map((part) => {
                  const batches = state.partBatches
                    .filter((b) => b.partId === part.id)
                    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
                  const totalQty = batches.reduce((s, b) => s + b.remainingQty, 0);
                  const fifoVal = batches.reduce(
                    (s, b) => s + b.remainingQty * b.unitCost,
                    0
                  );

                  return (
                    <tr key={part.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                        {part.code}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{part.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {part.category}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5 font-mono text-[11px] tabular-nums">
                          {batches.map((b) => (
                            <div
                              key={b.id}
                              className="text-slate-700 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 px-2.5 py-1.5 rounded border border-slate-200/80"
                            >
                              <div>
                                <span className="font-semibold text-slate-900">
                                  {b.batchLabel}
                                </span>{' '}
                                · {b.purchaseDate} · Rem: {b.remainingQty}/
                                {b.initialQty} units @ {fmtMoney(b.unitCost, true)}
                                /ea
                                {b.vendorName && (
                                  <span className="text-slate-500 font-sans ml-1.5">
                                    ({b.vendorName})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {b.invoiceScanUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewBatchScan(b)}
                                    className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-sans font-bold flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3 text-emerald-600" />
                                    <span>
                                      {b.scanDocType || 'Invoice'} #
                                      {b.invoiceNumber || 'SCAN'}
                                    </span>
                                  </button>
                                ) : (
                                  canMutate && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTargetScanBatch(b);
                                        setIsPartsCameraOpen(true);
                                      }}
                                      className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-sans font-semibold flex items-center gap-1"
                                    >
                                      <Camera className="w-2.5 h-2.5 text-[#f17832]" />
                                      <span>Attach Scan</span>
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                        <span
                          className={
                            totalQty <= 2 ? 'text-rose-600' : 'text-slate-900'
                          }
                        >
                          {totalQty} units
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                        {fmtMoney(fifoVal, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSV Batch Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl my-4 sm:my-8 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    Batch Import Parts Inventory (FIFO Tracking)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bulk import part batches from CSV with automated chronological FIFO cost assignment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Input Mode Toggle & Sample Helpers */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-md bg-slate-100 p-0.5 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded ${
                      activeTab === 'upload'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    File Upload (.csv)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('paste')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded ${
                      activeTab === 'paste'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Paste Raw CSV Text
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSample}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download Sample CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5 shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Try Sample Data</span>
                  </button>
                </div>
              </div>

              {/* Upload Dropzone or Textarea */}
              {activeTab === 'upload' ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    dragActive
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="w-12 h-12 mx-auto rounded-full bg-blue-100/70 text-blue-600 flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-semibold text-slate-800">
                    Click to browse or drag and drop your CSV file here
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Accepts comma-delimited columns: <span className="font-mono text-slate-700">Code, Name, Category, Quantity, UnitCost, BatchLabel, PurchaseDate</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Paste CSV Content (with or without headers)
                  </label>
                  <textarea
                    rows={6}
                    value={csvRawText}
                    onChange={(e) => handleProcessCsvText(e.target.value)}
                    placeholder={`Code,Name,Category,Quantity,UnitCost,BatchLabel,PurchaseDate\nOIL-0W20-SYN,Mobil 1 Full Synthetic 0W-20,Fluids,24,6.75,PO-2026-11-A,2026-11-08\nBRK-CER-F,Akebono Front Ceramic Brake Pads,Brakes,8,42.50,PO-2026-11-B,2026-11-09`}
                    className="w-full font-mono text-xs p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                  />
                </div>
              )}

              {/* Parsing Diagnostics & Error Messages */}
              {parsedResult.errors.length > 0 && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1 text-rose-800">
                  <div className="font-bold flex items-center gap-1.5 text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>CSV Parsing Warnings ({parsedResult.errors.length})</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-700 pl-1 font-mono text-[11px]">
                    {parsedResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Parsed Preview Table */}
              {parsedResult.items.length > 0 && (
                <div className="space-y-3">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">Batches to Create</div>
                      <div className="text-lg font-bold font-mono text-slate-900">
                        {parsedResult.items.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">Total Units</div>
                      <div className="text-lg font-bold font-mono text-blue-600">
                        {previewTotalUnits}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">Total Purchase Spend</div>
                      <div className="text-lg font-bold font-mono text-emerald-600">
                        {fmtMoney(previewTotalCost)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">FIFO Order</div>
                      <div className="text-xs font-semibold text-slate-700 mt-1">
                        Chronological by Purchase Date
                      </div>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold text-[11px]">
                        <tr>
                          <th className="py-2 px-3">SKU / Code</th>
                          <th className="py-2 px-3">Part Name</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Batch Label</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3 text-right">Unit Cost</th>
                          <th className="py-2 px-3 text-right">Total Cost</th>
                          <th className="py-2 px-3 text-center">Part Match</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {parsedResult.items.map((item, idx) => {
                          const existingPart = state.parts.find(
                            (p) => p.code.toLowerCase() === item.code.toLowerCase()
                          );
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                                {item.code}
                              </td>
                              <td className="py-2 px-3 text-slate-800 font-medium">
                                {item.name}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {item.category}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                                {item.batchLabel}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                                {item.purchaseDate}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-right text-slate-900">
                                {item.quantity}
                              </td>
                              <td className="py-2 px-3 font-mono text-right text-slate-700">
                                {fmtMoney(item.unitCost, true)}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-right text-emerald-700">
                                {fmtMoney(item.quantity * item.unitCost, true)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {existingPart ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                                    Appends FIFO
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">
                                    New Part SKU
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

              {/* Treasury Funding & Reconciliation Settings */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Treasury &amp; Ledger Integration
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Funding Account
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {state.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type}) — Bal: {fmtMoney(acc.balance)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-4 sm:pt-0">
                    <input
                      type="checkbox"
                      id="recordLedgerOutflow"
                      checked={recordLedgerOutflow}
                      onChange={(e) => setRecordLedgerOutflow(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="recordLedgerOutflow"
                      className="text-xs text-slate-700 font-medium cursor-pointer"
                    >
                      Deduct account balance &amp; write Treasury Ledger Outflow transaction
                    </label>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  FIFO batches will be stamped with exact acquisition costs and purchase dates. Downstream allocations to reconditioning repair orders and counter parts sales will automatically deplete the oldest batches first.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/60 rounded-md"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canMutate || parsedResult.items.length === 0}
                  onClick={handleConfirmBatchImport}
                  style={{ backgroundColor: state.settings.accentColor }}
                  className="px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Confirm &amp; Import ({parsedResult.items.length} FIFO Batches)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT CAMERA SCANNER FOR PARTS SERVICE INVOICES & VEHICLE TITLES */}
      <CameraDocumentScannerModal
        isOpen={isPartsCameraOpen}
        onClose={() => {
          setIsPartsCameraOpen(false);
          setTargetScanBatch(null);
        }}
        defaultDocType="Service Invoice"
        targetContextLabel={
          targetScanBatch
            ? `FIFO Batch ${targetScanBatch.batchLabel}`
            : 'New FIFO Part Stock Batch + Invoice Scan'
        }
        defaultCounterpartyOrVendor="WorldPac Commercial OEM Parts"
        defaultVinOrSku={
          targetScanBatch
            ? state.parts.find((p) => p.id === targetScanBatch.partId)?.code ||
              'BRK-PAD-01'
            : 'BRK-PAD-01'
        }
        defaultPrimaryTitle={
          targetScanBatch
            ? state.parts.find((p) => p.id === targetScanBatch.partId)?.name ||
              'Akebono ProACT Ceramic Front Brake Pads'
            : 'Akebono ProACT Ceramic Front Brake Pads'
        }
        defaultAmountText={
          targetScanBatch
            ? fmtMoney(targetScanBatch.initialQty * targetScanBatch.unitCost)
            : '$312.00'
        }
        showPartsBatchFields={!targetScanBatch}
        onCaptureSave={handleSavePartsCameraScan}
      />

      {/* SCANNED SERVICE INVOICE / TITLE LIGHTBOX PREVIEW IN PARTSVIEW */}
      {previewBatchScan && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewBatchScan(null)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#18181b] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4 text-[#f17832]" />
                <div>
                  <div className="text-sm font-bold">
                    {previewBatchScan.scanDocType || 'Service Invoice'} #
                    {previewBatchScan.invoiceNumber || 'SCAN'} ·{' '}
                    {previewBatchScan.batchLabel}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    Vendor: {previewBatchScan.vendorName || 'Verified Supplier'} ·
                    Purchase Date: {previewBatchScan.purchaseDate}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBatchScan(null)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 flex items-center justify-center">
                <img
                  src={previewBatchScan.invoiceScanUrl}
                  alt={previewBatchScan.batchLabel}
                  className="max-h-80 rounded object-contain mx-auto"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <div className="font-mono text-[11px] text-slate-600">
                  Batch Qty: <strong>{previewBatchScan.initialQty}</strong> units @{' '}
                  <strong>{fmtMoney(previewBatchScan.unitCost, true)}</strong>/ea
                </div>
                <div className="flex items-center gap-2">
                  {previewBatchScan.invoiceScanUrl && (
                    <a
                      href={previewBatchScan.invoiceScanUrl}
                      download={`Invoice_${previewBatchScan.invoiceNumber || previewBatchScan.batchLabel}.svg`}
                      className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-800 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Scan</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewBatchScan(null)}
                    style={{ backgroundColor: state.settings.accentColor }}
                    className="px-4 py-1.5 rounded-md font-semibold text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

