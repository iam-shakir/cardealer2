import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  Camera,
  Check,
  FileText,
  History,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useDealership } from '../context/DealershipContext';
import { ChatMessage, PendingAuditProposal } from '../types';
import {
  buildDealerAssistantResponse,
  generateVoiceAuditSummary,
} from '../utils/accounting';

const STARTER_CHIPS = [
  'What can you do?',
  'Add a 250 fuel expense',
  '🎙️ Summarize voice memo for Treasury',
  'How many cars are in stock?',
  'Who owes me money?',
];

export const AssistantDrawer: React.FC = () => {
  const {
    state,
    isAssistantOpen,
    setIsAssistantOpen,
    applyPendingAiAction,
    undoAiSnapshot,
    addAuditLogEntry,
    deleteAuditLogEntry,
    setActiveRoute,
    canMutate,
  } = useDealership();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        'Welcome to **Voice to Work** (v2.5.0). Speak or type any lot command — like *"Add a 250 fuel expense"* or *"Bought a 2021 Camry for 18,000, detailing 300"* — or upload a receipt photo. Every write action shows a **Before → After Preview Card** before saving.',
      timestamp: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceRecordedSnippet, setVoiceRecordedSnippet] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isAssistantOpen) return null;

  const handleSend = async (promptText?: string) => {
    const textToSend = (promptText ?? input).trim();
    if (!textToSend && !imageBase64) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend || 'Uploaded receipt/vehicle image for OCR analysis',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imagePreview: imageBase64 || undefined,
    };

    const currentImg = imageBase64;
    const currentMime = imageMimeType;

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setImageBase64(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          state,
          imageBase64: currentImg,
          imageMimeType: currentMime,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          pendingAction: data.pendingAction,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error('Server fallback');
      }
    } catch (_err) {
      const fallback = buildDealerAssistantResponse(textToSend, state, Boolean(currentImg));
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: fallback.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          pendingAction: fallback.pendingAction,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = (msgId: string) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target || !target.pendingAction || target.pendingAction.status !== 'pending') {
      return;
    }
    const snapshotId = applyPendingAiAction(target.pendingAction);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingAction
          ? {
              ...m,
              undoSnapshotId: snapshotId,
              pendingAction: {
                ...m.pendingAction,
                status: 'confirmed',
              },
            }
          : m
      )
    );
  };

  const handleCancelAction = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingAction
          ? {
              ...m,
              pendingAction: { ...m.pendingAction, status: 'cancelled' },
            }
          : m
      )
    );
  };

  const handleUndoAction = (msgId: string, snapshotId: string) => {
    const ok = undoAiSnapshot(snapshotId);
    if (ok) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.pendingAction
            ? {
                ...m,
                pendingAction: { ...m.pendingAction, status: 'undone' },
              }
            : m
        )
      );
    }
  };

  const handleVoiceToggle = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Simulated dictation fallback for environments without active speech hardware
      const mockDictation =
        'Approved thirty four thousand five hundred on floorplan for twenty twenty two Ford F-150 and three hundred fifty towing fee from Dallas';
      setInput(mockDictation);
      setVoiceRecordedSnippet(mockDictation);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
          setVoiceRecordedSnippet(transcript);
        }
        setIsListening(false);
      };
      recognition.onerror = () => {
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.start();
    } catch (_e) {
      setIsListening(false);
      const mockDictation =
        'Approved thirty four thousand five hundred on floorplan for twenty twenty two Ford F-150 and three hundred fifty towing fee from Dallas';
      setInput(mockDictation);
      setVoiceRecordedSnippet(mockDictation);
    }
  };

  const handleGenerateAuditSummary = async (transcriptText?: string) => {
    const rawTranscript = (transcriptText || input || voiceRecordedSnippet || '').trim();
    if (!rawTranscript) return;

    setIsLoading(true);
    setIsSummarizing(true);
    try {
      const response = await fetch('/api/ai/summarize-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawTranscript, state }),
      });

      let summaryData: any;
      if (response.ok) {
        const data = await response.json();
        summaryData = data.result;
      } else {
        throw new Error('Fallback required');
      }

      const proposalId = `audit-prop-${Date.now()}`;
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `I analyzed your voice dictation with Gemini and generated a **Treasury Audit Log** summary proposal. Review and save below:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pendingAuditProposal: {
          id: proposalId,
          title: summaryData.title,
          rawTranscript,
          summary: summaryData.summary,
          category: summaryData.category || 'General Overhead',
          financialImpact: summaryData.financialImpact,
          relatedVehicleVinOrStock: summaryData.relatedVehicleVinOrStock,
          status: 'pending',
        },
      };

      setMessages((prev) => [...prev, newMsg]);
      setInput('');
      setVoiceRecordedSnippet(null);
    } catch (_err) {
      const fallback = generateVoiceAuditSummary(rawTranscript, state);
      const proposalId = `audit-prop-${Date.now()}`;
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Generated a **Treasury Audit Log** summary from your voice memo:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pendingAuditProposal: {
          id: proposalId,
          title: fallback.title,
          rawTranscript,
          summary: fallback.summary,
          category: fallback.category,
          financialImpact: fallback.financialImpact,
          relatedVehicleVinOrStock: fallback.relatedVehicleVinOrStock,
          status: 'pending',
        },
      };
      setMessages((prev) => [...prev, newMsg]);
      setInput('');
      setVoiceRecordedSnippet(null);
    } finally {
      setIsLoading(false);
      setIsSummarizing(false);
    }
  };

  const handleSaveAuditProposal = (
    msgId: string,
    updatedProps?: Partial<PendingAuditProposal>
  ) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || !msg.pendingAuditProposal || msg.pendingAuditProposal.status !== 'pending') return;

    const current = { ...msg.pendingAuditProposal, ...updatedProps };
    const savedEntry = addAuditLogEntry({
      title: current.title,
      rawTranscript: current.rawTranscript,
      summary: current.summary,
      category: current.category,
      author: `${state.settings.displayName} (${state.settings.activeRole})`,
      status: 'verified',
      relatedVehicleVinOrStock: current.relatedVehicleVinOrStock,
      source: 'assistant_voice',
      financialImpact: current.financialImpact,
    });

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingAuditProposal
          ? {
              ...m,
              pendingAuditProposal: {
                ...m.pendingAuditProposal,
                ...updatedProps,
                status: 'saved',
                savedLogId: savedEntry.id,
              },
            }
          : m
      )
    );
  };

  const handleCancelAuditProposal = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingAuditProposal
          ? {
              ...m,
              pendingAuditProposal: {
                ...m.pendingAuditProposal,
                status: 'cancelled',
              },
            }
          : m
      )
    );
  };

  const handleDeleteSavedAuditLog = (msgId: string, logId: string) => {
    deleteAuditLogEntry(logId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingAuditProposal
          ? {
              ...m,
              pendingAuditProposal: {
                ...m.pendingAuditProposal,
                status: 'cancelled',
                savedLogId: undefined,
              },
            }
          : m
      )
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white border-l border-slate-200 shadow-2xl flex flex-col">
      {/* Drawer Header */}
      <div className="px-4 py-3 bg-[#18181b] text-white flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#f17832]" />
          <div>
            <div className="text-xs font-bold tracking-tight">Voice to Work Assistant</div>
            <div className="text-[11px] text-zinc-400">
              Preview-Then-Confirm · Role: {state.settings.activeRole}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: `msg-${Date.now()}`,
                  role: 'assistant',
                  content:
                    'Started a new chat session. Tell me what you bought, sold, or spent on the lot.',
                  timestamp: 'Just now',
                },
              ])
            }
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-200 flex items-center gap-1"
            title="Start New Chat"
          >
            <Trash2 className="w-3 h-3" />
            <span>New Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((p) => !p)}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            aria-label="Chat History"
            title="Chat History"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsAssistantOpen(false)}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            aria-label="Close Assistant Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional History Sub-Banner */}
      {showHistory && (
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs text-slate-600 flex items-center justify-between">
          <span>Active Thread ({messages.length} messages in local session)</span>
          <button
            type="button"
            onClick={() => setShowHistory(false)}
            className="text-slate-900 font-medium underline"
          >
            Hide
          </button>
        </div>
      )}

      {/* Starter Quick Prompt Chips */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
        {STARTER_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              if (chip.includes('Summarize voice memo')) {
                handleGenerateAuditSummary(
                  'Approved thirty four thousand five hundred on floorplan for 2022 Ford F-150 and three hundred fifty towing fee from Dallas'
                );
              } else {
                handleSend(chip);
              }
            }}
            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-[#f17832] text-xs font-medium text-slate-700 whitespace-nowrap transition-colors shrink-0"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Chat Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-slate-100 text-slate-800 border border-slate-200'
              }`}
            >
              {msg.imagePreview && (
                <img
                  src={msg.imagePreview}
                  alt="Uploaded attachment"
                  referrerPolicy="no-referrer"
                  className="w-40 h-28 object-cover rounded mb-2 border border-slate-300"
                />
              )}
              <div className="whitespace-pre-line">
                {msg.content.replace(/\*\*/g, '').replace(/\*/g, '')}
              </div>
            </div>

            {/* Mandatory Preview-Then-Confirm Card */}
            {msg.pendingAction && (
              <div className="mt-2.5 w-full bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-900 text-white flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    Action Preview · {msg.pendingAction.actionType.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="font-mono text-[11px] text-amber-400">
                    {msg.pendingAction.status.toUpperCase()}
                  </span>
                </div>
                <div className="p-3.5 space-y-2.5 text-xs">
                  <div className="font-semibold text-slate-900">
                    {msg.pendingAction.targetTitle}
                  </div>
                  <p className="text-slate-600">{msg.pendingAction.summary}</p>

                  {/* Before -> After Diff Table */}
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500">
                          <th className="py-1.5 px-2.5">FIELD</th>
                          <th className="py-1.5 px-2.5">BEFORE</th>
                          <th className="py-1.5 px-2.5">AFTER</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px] tabular-nums">
                        {msg.pendingAction.diffs.map((d, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 px-2.5 font-sans font-medium text-slate-700">
                              {d.field}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-400 break-all">{d.before}</td>
                            <td className="py-1.5 px-2.5 font-semibold text-emerald-700 break-all">
                              {d.after}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Confirmation / Undo Controls */}
                  {msg.pendingAction.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!canMutate}
                        onClick={() => handleConfirmAction(msg.id)}
                        style={{ backgroundColor: state.settings.accentColor }}
                        className="flex-1 py-2 px-3 rounded-md text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:opacity-95 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirm &amp; Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelAction(msg.id)}
                        className="py-2 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {msg.pendingAction.status === 'confirmed' && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-emerald-700 font-medium">
                        ✓ Applied to dealership books
                      </span>
                      {msg.undoSnapshotId && (
                        <button
                          type="button"
                          onClick={() => handleUndoAction(msg.id, msg.undoSnapshotId!)}
                          className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Undo Change</span>
                        </button>
                      )}
                    </div>
                  )}

                  {msg.pendingAction.status === 'cancelled' && (
                    <div className="text-slate-400 italic pt-1">
                      Action cancelled — no changes were made.
                    </div>
                  )}

                  {msg.pendingAction.status === 'undone' && (
                    <div className="text-amber-700 font-medium pt-1">
                      ↺ Change undone — previous balances and records restored.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Treasury Audit Summary Proposal Card */}
            {msg.pendingAuditProposal && (
              <div className="mt-2.5 w-full bg-white rounded-lg border border-amber-300 shadow-sm overflow-hidden">
                <div className="px-3.5 py-2 bg-[#18181b] text-white flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-[#f17832] shrink-0" />
                    <span className="truncate">Treasury Audit Summary · Voice Memo</span>
                  </div>
                  <span
                    className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      msg.pendingAuditProposal.status === 'saved'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                        : msg.pendingAuditProposal.status === 'cancelled'
                        ? 'bg-zinc-800 text-zinc-400'
                        : 'bg-amber-950 text-amber-400 border border-amber-600'
                    }`}
                  >
                    {msg.pendingAuditProposal.status === 'saved'
                      ? '✓ SAVED TO AUDIT LOG'
                      : msg.pendingAuditProposal.status === 'cancelled'
                      ? 'CANCELLED'
                      : 'PENDING SAVE'}
                  </span>
                </div>

                <div className="p-3.5 space-y-3 text-xs">
                  {/* Raw Voice Spoken Transcript */}
                  <div className="p-2.5 rounded bg-amber-50/70 border border-amber-200">
                    <div className="text-[10px] font-bold text-amber-800 flex items-center gap-1 mb-1 uppercase tracking-wide">
                      <Mic className="w-3 h-3 text-[#f17832]" />
                      <span>Spoken Voice Dictation</span>
                    </div>
                    <p className="italic text-slate-800 text-xs leading-relaxed">
                      "{msg.pendingAuditProposal.rawTranscript}"
                    </p>
                  </div>

                  {/* AI Structured Summary Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>Audit Log Title &amp; Category</span>
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                        {msg.pendingAuditProposal.category}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900 text-xs bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200">
                      {msg.pendingAuditProposal.title}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 pt-1">
                      Structured AI Controller Summary
                    </div>
                    <p className="text-slate-700 text-xs leading-relaxed bg-white p-2.5 rounded border border-slate-200">
                      {msg.pendingAuditProposal.summary}
                    </p>
                  </div>

                  {/* Meta indicators: Financial Impact & Target */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 border-t border-slate-100">
                    <span className="font-mono text-emerald-700 font-semibold">
                      Impact: {msg.pendingAuditProposal.financialImpact || 'Operational Audit'}
                    </span>
                    <span className="text-slate-500 font-sans">
                      🏛️ Target: <strong>Treasury Ledger → Audit Log</strong>
                    </span>
                  </div>

                  {/* Action Buttons */}
                  {msg.pendingAuditProposal.status === 'pending' && (
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canMutate}
                        onClick={() => handleSaveAuditProposal(msg.id)}
                        style={{ backgroundColor: state.settings.accentColor }}
                        className="flex-1 py-1.5 rounded-md font-semibold text-white flex items-center justify-center gap-1.5 hover:opacity-95 disabled:opacity-50 text-xs shadow-xs"
                      >
                        <BookmarkCheck className="w-3.5 h-3.5" />
                        <span>Save to Treasury Audit Log</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelAuditProposal(msg.id)}
                        className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 font-medium text-slate-700 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {msg.pendingAuditProposal.status === 'saved' && (
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-emerald-700 font-semibold text-xs flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Saved in Treasury Audit Log</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRoute('finance');
                            setIsAssistantOpen(false);
                          }}
                          className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-zinc-800 text-white font-medium text-xs flex items-center gap-1"
                        >
                          <span>View in Treasury Ledger</span>
                          <ArrowRight className="w-3 h-3 text-[#f17832]" />
                        </button>
                        {msg.pendingAuditProposal.savedLogId && (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteSavedAuditLog(
                                msg.id,
                                msg.pendingAuditProposal!.savedLogId!
                              )
                            }
                            className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium text-xs flex items-center gap-1"
                            title="Undo and delete from Treasury Audit Log"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Undo</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {msg.pendingAuditProposal.status === 'cancelled' && (
                    <div className="text-slate-400 italic text-xs pt-1">
                      Audit proposal cancelled — not saved to Treasury Ledger.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1">
              {msg.role === 'user' && (
                <button
                  type="button"
                  onClick={() => handleGenerateAuditSummary(msg.content)}
                  className="text-[10px] text-slate-500 hover:text-[#f17832] flex items-center gap-1 font-medium transition-colors"
                  title="Generate Treasury Audit Summary from this voice or text memo"
                >
                  <Sparkles className="w-3 h-3 text-[#f17832]" />
                  <span>Summarize for Treasury</span>
                </button>
              )}
              <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="text-xs text-slate-500 italic">
            Voice to Work is analyzing dealership state...
          </div>
        )}
      </div>

      {/* Bottom Composer Bar */}
      <div className="p-3 bg-white border-t border-slate-200 space-y-2">
        {imageBase64 && (
          <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200 text-xs">
            <span className="truncate text-slate-700">Receipt / Car photo attached</span>
            <button
              type="button"
              onClick={() => setImageBase64(null)}
              className="text-rose-600 font-medium"
            >
              Remove
            </button>
          </div>
        )}

        {voiceRecordedSnippet && (
          <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between text-xs text-amber-900 gap-2 shadow-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Mic className="w-3.5 h-3.5 text-[#f17832] shrink-0" />
              <span className="truncate font-medium">Spoken: "{voiceRecordedSnippet}"</span>
            </div>
            <div className="flex items-center justify-end gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleGenerateAuditSummary(voiceRecordedSnippet)}
                style={{ backgroundColor: state.settings.accentColor }}
                className="px-2.5 py-1 rounded text-white font-semibold text-[11px] flex items-center gap-1 hover:opacity-95 shadow-xs whitespace-nowrap"
              >
                <Sparkles className="w-3 h-3" />
                <span>✨ Summarize for Treasury Log</span>
              </button>
              <button
                type="button"
                onClick={() => setVoiceRecordedSnippet(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
                title="Dismiss"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-1.5 sm:gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
            aria-label="Upload receipt or car photo"
            title="Upload Receipt or Vehicle Photo"
          >
            <Camera className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say or type (e.g. 'Add a 250 fuel expense')..."
            className="flex-1 min-w-0 px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-none focus:border-[#f17832]"
          />

          <button
            type="button"
            onClick={handleVoiceToggle}
            className={`p-2 rounded-md border transition-colors shrink-0 ${
              isListening
                ? 'bg-rose-600 text-white border-rose-600'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            aria-label="Voice input microphone"
            title="Voice Input (Web Speech API)"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            type="submit"
            style={{ backgroundColor: state.settings.accentColor }}
            className="p-2 rounded-md text-white hover:opacity-95 shrink-0"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
