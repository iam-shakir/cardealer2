import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  buildDealerAssistantResponse,
  generateVoiceAuditSummary,
  parseSmartPasteVehicleText,
} from './src/utils/accounting';

const PORT = 3000;

function getGenAIClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // 1. Smart Paste Vehicle Spec Parser Endpoint (/api/ai/smart-paste)
  app.post('/api/ai/smart-paste', async (req, res) => {
    const { rawText } = req.body || {};
    if (!rawText || typeof rawText !== 'string') {
      res.status(400).json({ error: 'rawText is required' });
      return;
    }

    const fallbackSpec = parseSmartPasteVehicleText(rawText);
    const ai = getGenAIClient();

    if (!ai) {
      res.json({ spec: fallbackSpec, source: 'local-parser' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Extract structured vehicle inventory fields from this car dealer listing text:\n\n"${rawText}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              year: { type: Type.INTEGER },
              make: { type: Type.STRING },
              model: { type: Type.STRING },
              trim: { type: Type.STRING },
              vin: { type: Type.STRING },
              mileage: { type: Type.INTEGER },
              purchasePrice: { type: Type.NUMBER },
              askingPrice: { type: Type.NUMBER },
              engine: { type: Type.STRING },
              drivetrain: { type: Type.STRING },
              color: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
          },
        },
      });

      const parsedJson = JSON.parse((response.text ?? '{}').trim());
      res.json({
        spec: { ...fallbackSpec, ...parsedJson },
        source: 'gemini',
      });
    } catch (_err) {
      res.json({ spec: fallbackSpec, source: 'fallback' });
    }
  });

  // 2. Slide-Out "Voice to Work" AI Assistant Endpoint (/api/ai/assistant)
  app.post('/api/ai/assistant', async (req, res) => {
    const { prompt, state, imageBase64, imageMimeType } = req.body || {};
    if (!prompt && !imageBase64) {
      res.status(400).json({ error: 'Prompt or image is required' });
      return;
    }

    // First compute the deterministic structured proposal / analytical response
    const deterministicResult = buildDealerAssistantResponse(
      prompt || 'Analyze uploaded receipt',
      state,
      Boolean(imageBase64)
    );

    const ai = getGenAIClient();
    if (!ai) {
      res.json(deterministicResult);
      return;
    }

    // If it's a write mutation with a PendingActionPreview, we keep the exact deterministic
    // PendingActionPreview diff math (so "One Profit Everywhere" & RBAC invariants are 100% exact)
    // and optionally enrich the conversational text or image OCR via Gemini.
    if (deterministicResult.pendingAction && !imageBase64) {
      res.json(deterministicResult);
      return;
    }

    try {
      const isSensitiveAllowed =
        state?.settings?.activeRole === 'Owner' || state?.settings?.activeRole === 'Admin';
      const activeVehicles = (state?.vehicles || []).filter((v: any) => v.status !== 'Sold');

      const systemContext = `You are the "Voice to Work" AI Assistant inside Car Dealer Tracker (${
        state?.settings?.dealershipName || 'Dealership'
      }).
Active Role: ${state?.settings?.activeRole || 'Owner'}.
RBAC Rule: ${
        isSensitiveAllowed
          ? 'User has full Owner/Admin financial visibility.'
          : 'STRICT RBAC MASKING ACTIVE: NEVER reveal purchasePrice, wholesaleValue, netProfit, profitMargin, or bank account balances!'
      }
Active Inventory Count: ${activeVehicles.length}.
Keep answers concise, tabular, and directly grounded in the dealership state.`;

      const parts: any[] = [];
      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType: imageMimeType || 'image/jpeg',
            data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
          },
        });
      }
      parts.push({
        text: `${systemContext}\n\nDealer request: ${prompt || 'Extract receipt or vehicle details from this image.'}`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
      });

      const aiText = response.text?.trim();
      res.json({
        reply: aiText || deterministicResult.reply,
        pendingAction: deterministicResult.pendingAction,
      });
    } catch (_err) {
      res.json(deterministicResult);
    }
  });

  // 3. Voice-to-Audit Summary Generator Endpoint (/api/ai/summarize-voice)
  app.post('/api/ai/summarize-voice', async (req, res) => {
    const { rawTranscript, state } = req.body || {};
    if (!rawTranscript || typeof rawTranscript !== 'string') {
      res.status(400).json({ error: 'rawTranscript is required' });
      return;
    }

    const fallback = generateVoiceAuditSummary(rawTranscript, state);
    const ai = getGenAIClient();

    if (!ai) {
      res.json({ result: fallback, source: 'local-audit-parser' });
      return;
    }

    try {
      const isSensitiveAllowed =
        state?.settings?.activeRole === 'Owner' || state?.settings?.activeRole === 'Admin';
      const prompt = `You are the Lead Financial Auditor & Controller for Car Dealer Tracker (${
        state?.settings?.dealershipName || 'Apex Motors & Imports'
      }).
Active Role: ${state?.settings?.activeRole || 'Owner'}.
RBAC Policy: ${
        isSensitiveAllowed
          ? 'Full Owner/Admin financial visibility.'
          : 'Sales/Restricted view (mask wholesale profit margins).'
      }

The car dealer spoke or dictated the following voice note on the lot:
"${rawTranscript}"

Generate a structured financial & operational audit record for the Treasury Ledger:
1. title: A concise 4-8 word title (e.g. "Voice Memo: F-150 Carrier Dispatch Fee")
2. summary: A professional 2-3 sentence executive audit summary documenting dates, dollar amounts, vehicles, accounts affected, and operational significance.
3. category: Choose one of ["Vehicle Acquisition", "Reconditioning & Detailing", "Repairs & Mechanical", "Transport & Towing", "FIFO Part Stock Purchase", "Lot Lease & Facilities", "Debt Settlement", "Sales Proceeds", "FIFO Part Sales", "Cash Movement", "General Overhead"]
4. financialImpact: Estimated net cash effect (e.g. "-$350.00 cash outflow" or "+$500.00 cash inflow" or "No direct cash movement")
5. relatedVehicleVinOrStock: Stock ID or VIN if referenced, or null.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              category: { type: Type.STRING },
              financialImpact: { type: Type.STRING },
              relatedVehicleVinOrStock: { type: Type.STRING },
            },
            required: ['title', 'summary', 'category'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        result: {
          title: parsed.title || fallback.title,
          summary: parsed.summary || fallback.summary,
          category: parsed.category || fallback.category,
          financialImpact: parsed.financialImpact || fallback.financialImpact,
          relatedVehicleVinOrStock:
            parsed.relatedVehicleVinOrStock || fallback.relatedVehicleVinOrStock,
          source: 'gemini',
        },
      });
    } catch (_err) {
      res.json({ result: fallback, source: 'fallback' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Car Dealer Tracker server running at http://localhost:${PORT}`);
  });
}

startServer();
