# AI_NODES

All AI work flows through `api/services/nvidiaAI.js` (server-side only):

- **Model:** `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- **Endpoint:** `https://integrate.api.nvidia.com/v1/chat/completions`
- **Key:** `NVIDIA_API_KEY` env var — never `VITE_`-prefixed, never in the
  browser, never logged.

## Common parameters

Every AI node supports **prompt/input variable**, **system instruction**,
**temperature** (clamped 0–1.5), **maximum output tokens** (clamped 1–8192) and
**JSON output mode** where applicable (`response_format: { type: 'json_object' }`).

## The five nodes

1. **AI Generation** — free-form text. Output: `{ text }`.
2. **AI Classification** — input + your `categories[]`. Forces JSON mode and
   guarantees the contract below. Labels outside your allowlist are blanked
   (drift guard) instead of passed through.
   ```json
   { "label": "", "confidence": 0, "reason": "" }
   ```
3. **AI Extraction** — input + your JSON `schema`. The model is instructed to
   return a bare JSON object; output: `{ data, parseOk }`.
4. **AI Summarization** — input + optional style hint. Output:
   `{ summary, text }`.
5. **AI Data Transformation** — input data + instruction, JSON mode on. Output:
   `{ data, parseOk, raw }`. The model returns **data only** — it is parsed,
   never executed.

## AI safety rules (enforced)

- AI output is **always untrusted data**: parsed with `safeParseJson()` (direct
  parse, then first `{…}` block fallback), never `eval`'d or passed to a runner.
- Transformations use **predefined operations** (`transform_data` op list) or
  parsed AI-returned JSON — generated JavaScript is never dynamically executed.
- Timeouts (60 s) + abort, retryable-status detection (429/5xx → retry),
  prompt/input length caps, temperature clamping.
- Smoke-test without building a flow: dashboard **Test Nemotron** box →
  `POST /api/ai/test` (authenticated, rate-limited).
