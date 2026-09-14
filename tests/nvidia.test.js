import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatRequest, safeParseJson, extractText,
  chatCompletion, classify, NVIDIA_MODEL
} from '../api/_lib/nvidiaAI.js';

const okJson = (obj) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] })
});

describe('nvidiaAI service', () => {
  const OLD = process.env.NVIDIA_API_KEY;
  beforeEach(() => { process.env.NVIDIA_API_KEY = 'test-key'; });
  afterEach(() => {
    if (OLD === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = OLD;
  });

  it('targets the Nemotron reasoning model with clamped params', () => {
    const body = buildChatRequest({ system: 's', prompt: 'p', temperature: 99, maxTokens: 999999, jsonMode: true });
    assert.equal(body.model, NVIDIA_MODEL);
    assert.equal(body.temperature, 1.5);
    assert.equal(body.max_tokens, 8192);
    assert.deepEqual(body.response_format, { type: 'json_object' });
  });

  it('safeParseJson handles direct JSON and wrapped JSON without throwing', () => {
    assert.deepEqual(safeParseJson('{"a":1}'), { ok: true, data: { a: 1 } });
    const wrapped = safeParseJson('Here you go:\n{"label":"paid","confidence":0.9}');
    assert.equal(wrapped.ok, true);
    assert.equal(wrapped.data.label, 'paid');
    assert.deepEqual(safeParseJson('no json here'), { ok: false, data: null });
  });

  it('extractText reads chat-completions payloads', () => {
    assert.equal(extractText({ choices: [{ message: { content: 'hi' } }] }), 'hi');
    assert.equal(extractText({}), '');
  });

  it('chatCompletion posts to the NVIDIA endpoint (stubbed fetch)', async () => {
    let seen = null;
    const text = await chatCompletion(
      { system: 'sys', prompt: 'hello', temperature: 0.2, maxTokens: 64 },
      {
        fetchImpl: async (url, opts) => {
          seen = { url, opts };
          return okJson({ hello: 'world' });
        }
      }
    );
    assert.match(seen.url, /integrate\.api\.nvidia\.com\/v1\/chat\/completions/);
    assert.equal(seen.opts.headers.Authorization, 'Bearer test-key');
    assert.equal(JSON.parse(seen.opts.body).model, NVIDIA_MODEL);
    assert.equal(text, '{"hello":"world"}');
  });

  it('classify returns the {label, confidence, reason} contract', async () => {
    const out = await classify(
      { input: 'I love it', categories: ['praise', 'complaint'] },
      { fetchImpl: async () => okJson({ label: 'praise', confidence: 0.97, reason: 'positive words' }) }
    );
    assert.equal(out.label, 'praise');
    assert.equal(out.confidence, 0.97);
    assert.equal(out.reason, 'positive words');
  });

  it('classify blanks labels outside the allowlist (model drift guard)', async () => {
    const out = await classify(
      { input: 'meh', categories: ['praise', 'complaint'] },
      { fetchImpl: async () => okJson({ label: 'ecstatic', confidence: 1, reason: 'x' }) }
    );
    assert.equal(out.label, '');
  });

  it('marks server errors retryable and auth errors not', async () => {
    const err500 = await chatCompletion({ prompt: 'x' }, {
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'busy' })
    }).then(() => null, (e) => e);
    assert.equal(err500.retryable, true);
    const err401 = await chatCompletion({ prompt: 'x' }, {
      fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'nope' })
    }).then(() => null, (e) => e);
    assert.equal(err401.retryable, false);
  });

  it('fails fast with a clear error when the server key is missing', async () => {
    delete process.env.NVIDIA_API_KEY;
    await assert.rejects(chatCompletion({ prompt: 'x' }), /NVIDIA_API_KEY/);
  });
});
