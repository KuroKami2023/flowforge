/**
 * NVIDIA Nemotron service — server-side only.
 *
 * Model: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
 * Endpoint: https://integrate.api.nvidia.com/v1
 *
 * AI output is ALWAYS treated as untrusted data. This module only returns
 * text / parsed JSON. It never executes anything.
 */
import { setTimeout as delay } from 'node:timers/promises';

export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

const DEFAULT_TIMEOUT_MS = 60000;

function getApiKey() {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    const err = new Error('NVIDIA_API_KEY is not configured on the server.');
    err.code = 'NVIDIA_KEY_MISSING';
    throw err;
  }
  return key;
}

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function buildChatRequest({ system, prompt, temperature = 0.3, maxTokens = 1024, jsonMode = false }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: String(system).slice(0, 8000) });
  messages.push({ role: 'user', content: String(prompt ?? '').slice(0, 24000) });
  const body = {
    model: NVIDIA_MODEL,
    messages,
    temperature: clamp(temperature, 0, 1.5, 0.3),
    max_tokens: clamp(maxTokens, 1, 8192, 1024)
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  return body;
}

/** Extract the assistant text from a chat-completions payload. */
export function extractText(data) {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'string' ? p : p?.text ?? ''))
      .join('');
  }
  return '';
}

/**
 * Safely parse JSON from model output. Tries direct parse first, then the
 * first balanced {...} block. Returns { ok, data } — never throws for
 * malformed model output.
 */
export function safeParseJson(text) {
  if (typeof text !== 'string') return { ok: false, data: null };
  const trimmed = text.trim();
  try {
    return { ok: true, data: JSON.parse(trimmed) };
  } catch {
    // fall through to block extraction
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return { ok: true, data: JSON.parse(trimmed.slice(start, end + 1)) };
    } catch {
      return { ok: false, data: null };
    }
  }
  return { ok: false, data: null };
}

export async function chatCompletion(
  { system, prompt, temperature, maxTokens, jsonMode },
  { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}
) {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(buildChatRequest({ system, prompt, temperature, maxTokens, jsonMode })),
      signal: controller.signal
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err = new Error(`NVIDIA API error ${res.status}: ${detail.slice(0, 500)}`);
      err.code = 'NVIDIA_API_ERROR';
      err.status = res.status;
      // Retryable statuses
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    const data = await res.json();
    return extractText(data);
  } catch (err) {
    if (err?.name === 'AbortError') {
      const e = new Error(`NVIDIA request timed out after ${timeoutMs}ms.`);
      e.code = 'NVIDIA_TIMEOUT';
      e.retryable = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Classification helper — guarantees the {label, confidence, reason} shape. */
export async function classify({ input, categories, system, temperature, maxTokens }, opts) {
  const list = categories.map((c) => `- ${c}`).join('\n');
  const prompt = `Classify the following input into exactly one of the allowed categories.\n\nAllowed categories:\n${list}\n\nInput:\n${input}\n\nRespond with JSON only: {"label": "<one of the allowed categories>", "confidence": <0-1 number>, "reason": "<short explanation>"}`;
  const text = await chatCompletion(
    {
      system: system || 'You are a precise text classifier. Respond with JSON only.',
      prompt,
      temperature: temperature ?? 0.1,
      maxTokens: maxTokens ?? 512,
      jsonMode: true
    },
    opts
  );
  const parsed = safeParseJson(text);
  if (parsed.ok && parsed.data && typeof parsed.data === 'object') {
    let { label = '', confidence = 0, reason = '' } = parsed.data;
    if (!categories.includes(label)) {
      // Model drifted outside the allowlist — keep it honest.
      label = '';
    }
    return {
      label,
      confidence: clamp(confidence, 0, 1, 0),
      reason: String(reason ?? '').slice(0, 1000),
      _raw: text.slice(0, 4000)
    };
  }
  return { label: '', confidence: 0, reason: 'Model returned unparseable output.', _raw: text.slice(0, 4000) };
}

/** Extraction helper — returns structured JSON conforming (best-effort) to schema. */
export async function extract({ input, schema, system, temperature, maxTokens }, opts) {
  const prompt = `Extract structured data from the input below according to this JSON schema.\n\nSchema:\n${JSON.stringify(schema)}\n\nInput:\n${input}\n\nRespond with a JSON object only — no code, no explanation, no markdown fences.`;
  const text = await chatCompletion(
    {
      system: system || 'You extract structured JSON from text. Respond with JSON only.',
      prompt,
      temperature: temperature ?? 0.1,
      maxTokens: maxTokens ?? 1024,
      jsonMode: true
    },
    opts
  );
  const parsed = safeParseJson(text);
  return {
    data: parsed.ok ? parsed.data : null,
    parseOk: parsed.ok,
    _raw: text.slice(0, 8000)
  };
}

/** Summarization helper. */
export async function summarize({ input, system, temperature, maxTokens, style }, opts) {
  const prompt = style
    ? `Summarize the following (${style}):\n\n${input}`
    : `Summarize the following:\n\n${input}`;
  return chatCompletion(
    {
      system: system || 'You write clear, concise summaries.',
      prompt,
      temperature: temperature ?? 0.3,
      maxTokens: maxTokens ?? 1024,
      jsonMode: false
    },
    opts
  );
}

/** Free-form generation helper. */
export async function generate({ input, system, temperature, maxTokens }, opts) {
  return chatCompletion(
    {
      system: system || 'You are a helpful assistant inside a workflow automation platform.',
      prompt: input,
      temperature: temperature ?? 0.3,
      maxTokens: maxTokens ?? 1024,
      jsonMode: false
    },
    opts
  );
}

export async function waitForRateLimitReset() {
  await delay(1000);
}
