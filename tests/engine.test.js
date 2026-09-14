import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow, buildExecutionOrder, findFirstFailedNode } from '../api/_lib/executionEngine.js';
import { DEMO_WORKFLOWS } from '../src/lib/demoWorkflows.js';

const N = (id, type, config = {}, extra = {}) => ({
  id, type, config, inputMapping: {}, outputMapping: {},
  position: { x: 0, y: 0 },
  errorHandling: { onError: 'stop', retryCount: 0, retryDelayMs: 0 },
  ...extra
});
const C = (from, to, sourceHandle) => (sourceHandle ? { from, to, sourceHandle } : { from, to });

const jsonDemo = () => DEMO_WORKFLOWS.find((d) => d.key === 'json-transformer');

describe('execution ordering', () => {
  it('topologically orders a linear chain', () => {
    const order = buildExecutionOrder({
      nodes: [N('t', 'manual_trigger'), N('a', 'formatter'), N('b', 'formatter')],
      connections: [C('t', 'a'), C('a', 'b')]
    });
    assert.deepEqual(order, ['t', 'a', 'b']);
  });
});

describe('execution engine', () => {
  it('loads, validates and runs the JSON Data Transformer demo end to end', async () => {
    const demo = jsonDemo();
    const run = await runWorkflow(demo.definition, {
      triggerData: demo.sampleInput,
      workflowInput: demo.sampleInput
    });
    assert.equal(run.status, 'success');
    assert.equal(run.errors.length, 0);
    // parse -> adults -> reshape -> export all ran
    for (const id of ['trigger', 'parse', 'adults', 'reshape', 'export']) {
      assert.equal(run.nodeResults[id]?.status, 'success', id);
    }
    const csv = run.nodeResults.export.output.csv;
    assert.match(csv, /name,age,city/);
    assert.match(csv, /Cid,29,Nairobi/);
    assert.match(csv, /Amy,34,Lagos/);
    // Ben (15) was filtered out
    assert.doesNotMatch(csv, /Ben/);
    assert.equal(run.nodeResults.export.output.rowCount, 2);
  });

  it('passes node outputs downstream and substitutes variables', async () => {
    const run = await runWorkflow({
      nodes: [
        N('trigger', 'manual_trigger'),
        N('set', 'set_value', { values: { who: '{{trigger.name}}' } }),
        N('msg', 'formatter', { template: 'Hello {{nodes.set.output.who}}!' })
      ],
      connections: [C('trigger', 'set'), C('set', 'msg')]
    }, { triggerData: { name: 'Ada' }, workflowInput: { name: 'Ada' } });
    assert.equal(run.status, 'success');
    assert.equal(run.nodeResults.msg.output.text, 'Hello Ada!');
  });

  it('follows the taken branch of a condition', async () => {
    const def = (status) => ({
      nodes: [
        N('trigger', 'manual_trigger'),
        N('check', 'condition', { logic: 'and', conditions: [{ left: '{{trigger.status}}', operator: 'equals', right: 'paid' }] }),
        N('yes', 'formatter', { template: 'paid' }),
        N('no', 'formatter', { template: 'unpaid' })
      ],
      connections: [C('trigger', 'check'), C('check', 'yes', 'true'), C('check', 'no', 'false')]
    });
    const paid = await runWorkflow(def(), { triggerData: { status: 'paid' }, workflowInput: {} });
    assert.equal(paid.status, 'success');
    assert.equal(paid.nodeResults.yes?.status, 'success');
    assert.equal(paid.nodeResults.no, undefined);
    const unpaid = await runWorkflow(def(), { triggerData: { status: 'overdue' }, workflowInput: {} });
    assert.equal(unpaid.nodeResults.no?.status, 'success');
    assert.equal(unpaid.nodeResults.yes, undefined);
  });

  it('retries configured nodes and reports attempts', async () => {
    const run = await runWorkflow({
      nodes: [
        N('trigger', 'manual_trigger'),
        N('bad', 'json_parser', { input: 'not-json{{{' }, { errorHandling: { onError: 'stop', retryCount: 2, retryDelayMs: 1 } })
      ],
      connections: [C('trigger', 'bad')]
    }, { triggerData: {}, workflowInput: {} });
    assert.equal(run.status, 'failed');
    assert.equal(run.nodeResults.bad.attempts, 3);
    assert.equal(findFirstFailedNode(run.nodeResults), 'bad');
  });

  it('continues past failures when onError=continue', async () => {
    const run = await runWorkflow({
      nodes: [
        N('trigger', 'manual_trigger'),
        N('bad', 'json_parser', { input: 'nope' }, { errorHandling: { onError: 'continue', retryCount: 0, retryDelayMs: 0 } }),
        N('after', 'formatter', { template: 'still here' })
      ],
      connections: [C('trigger', 'bad'), C('bad', 'after')]
    }, { triggerData: {}, workflowInput: {} });
    assert.equal(run.status, 'failed'); // the failure is still recorded…
    assert.equal(run.nodeResults.after?.status, 'success'); // …but downstream ran
    assert.equal(run.errors[0].nodeId, 'bad');
  });

  it('blocks SSRF-style private hosts in HTTP nodes', async () => {
    const run = await runWorkflow({
      nodes: [
        N('trigger', 'manual_trigger'),
        N('req', 'http_request', { method: 'GET', url: 'http://localhost:3000/secret' })
      ],
      connections: [C('trigger', 'req')]
    }, { triggerData: {}, workflowInput: {} });
    assert.equal(run.status, 'failed');
    assert.match(run.nodeResults.req.error, /private|blocked/i);
  });

  it('loop maps over arrays with templates', async () => {
    const run = await runWorkflow({
      nodes: [
        N('trigger', 'manual_trigger'),
        N('loop', 'loop', { items: '{{trigger.items}}', maxIterations: 10, itemTemplate: { doubled: '{{loop.item}}' } })
      ],
      connections: [C('trigger', 'loop')]
    }, { triggerData: { items: [1, 2, 3] }, workflowInput: {} });
    assert.equal(run.status, 'success');
    assert.equal(run.nodeResults.loop.output.count, 3);
  });

  it('every demo definition has the shape the engine needs', () => {
    for (const demo of DEMO_WORKFLOWS) {
      for (const node of demo.definition.nodes) {
        assert.ok(node.id && node.type, `${demo.key} node missing id/type`);
        assert.ok(node.position, `${demo.key}/${node.id} missing position`);
        assert.ok(node.errorHandling, `${demo.key}/${node.id} missing error handling`);
      }
    }
  });
});
