import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflow, validateWorkflowMeta } from '../api/_lib/validator.js';
import { DEMO_WORKFLOWS } from '../src/lib/demoWorkflows.js';

const n = (id, type, config = {}) => ({
  id, type, config, inputMapping: {}, outputMapping: {},
  position: { x: 0, y: 0 }, errorHandling: { onError: 'stop', retryCount: 0, retryDelayMs: 0 }
});

describe('workflow validation', () => {
  it('accepts a minimal valid workflow', () => {
    const v = validateWorkflow({
      nodes: [n('t', 'manual_trigger'), n('f', 'formatter', { template: 'hi' })],
      connections: [{ from: 't', to: 'f' }]
    });
    assert.equal(v.valid, true);
  });

  it('all five demo workflows validate', () => {
    for (const demo of DEMO_WORKFLOWS) {
      const v = validateWorkflow(demo.definition);
      assert.equal(v.valid, true, `${demo.key}: ${v.errors.join('; ')}`);
    }
  });

  it('rejects missing trigger', () => {
    const v = validateWorkflow({ nodes: [n('f', 'formatter')], connections: [] });
    assert.equal(v.valid, false);
    assert.match(v.errors.join(' '), /trigger/);
  });

  it('rejects duplicate ids, unknown types and bad references', () => {
    const dup = validateWorkflow({ nodes: [n('a', 'manual_trigger'), n('a', 'formatter')], connections: [] });
    assert.equal(dup.valid, false);
    const unk = validateWorkflow({ nodes: [n('t', 'manual_trigger'), n('x', 'teleport')], connections: [] });
    assert.equal(unk.valid, false);
    const badRef = validateWorkflow({
      nodes: [n('t', 'manual_trigger')], connections: [{ from: 't', to: 'ghost' }]
    });
    assert.equal(badRef.valid, false);
    const self = validateWorkflow({
      nodes: [n('t', 'manual_trigger')], connections: [{ from: 't', to: 't' }]
    });
    assert.equal(self.valid, false);
  });

  it('rejects cycles', () => {
    const v = validateWorkflow({
      nodes: [n('t', 'manual_trigger'), n('a', 'formatter'), n('b', 'formatter')],
      connections: [{ from: 't', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }]
    });
    assert.equal(v.valid, false);
    assert.match(v.errors.join(' '), /cycle/);
  });

  it('enforces per-type required config', () => {
    assert.equal(validateWorkflow({ nodes: [n('t', 'manual_trigger'), n('h', 'http_request', {})], connections: [] }).valid, false);
    assert.equal(validateWorkflow({ nodes: [n('t', 'manual_trigger'), n('c', 'ai_classification', {})], connections: [] }).valid, false);
    assert.equal(validateWorkflow({ nodes: [n('t', 'manual_trigger'), n('c', 'condition', {})], connections: [] }).valid, false);
    assert.equal(validateWorkflow({ nodes: [n('t', 'manual_trigger'), n('s', 'switch', {})], connections: [] }).valid, false);
    assert.equal(validateWorkflow({ nodes: [n('t', 'manual_trigger'), n('e', 'ai_extraction', {})], connections: [] }).valid, false);
  });

  it('validates workflow metadata', () => {
    assert.equal(validateWorkflowMeta({ name: '  ' }).valid, false);
    assert.equal(validateWorkflowMeta({ name: 'OK', enabled: 'yes' }).valid, false);
    assert.equal(validateWorkflowMeta({ name: 'OK', enabled: true }).valid, true);
  });
});
