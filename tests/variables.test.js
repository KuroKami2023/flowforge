import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPath, isSafePath, resolveString, resolveDeep,
  buildContext, listExpressions, validateExpressions
} from '../api/_lib/variables.js';

describe('variable system', () => {
  it('resolves trigger, nodes and workflow.input paths', () => {
    const ctx = buildContext({
      triggerData: { email: 'a@x.com', name: 'Ada' },
      workflowInput: { customer_id: 'C-1' },
      nodeOutputs: { http_request: { output: { total: 3 } } }
    });
    assert.equal(getPath(ctx, 'trigger.email'), 'a@x.com');
    assert.equal(getPath(ctx, 'workflow.input.customer_id'), 'C-1');
    assert.equal(getPath(ctx, 'nodes.http_request.output.total'), 3);
  });

  it('supports array indexes', () => {
    const ctx = buildContext({ nodeOutputs: { parse: { output: { users: [{ age: 5 }] } } } });
    assert.equal(getPath(ctx, 'nodes.parse.output.users[0].age'), 5);
  });

  it('returns raw values for full-string expressions (type preserving)', () => {
    const ctx = buildContext({ nodeOutputs: { n: { output: { items: [1, 2] } } } });
    assert.deepEqual(resolveString('{{nodes.n.output}}', ctx), { items: [1, 2] });
    assert.equal(resolveString('count={{nodes.n.output.items.length}}', ctx), 'count=2');
  });

  it('interpolates partial templates and stringifies objects', () => {
    const ctx = buildContext({ triggerData: { name: 'Ada' }, nodeOutputs: { c: { output: { label: 'paid' } } } });
    assert.equal(resolveString('Hi {{trigger.name}}!', ctx), 'Hi Ada!');
    assert.equal(resolveString('R={{nodes.c.output}}', ctx), 'R={"label":"paid"}');
    assert.equal(resolveString('X={{missing.path}}Y', ctx), 'X=Y');
  });

  it('rejects unsafe paths (no code execution surface)', () => {
    for (const bad of [
      'constructor.prototype',
      '__proto__.x',
      'a; process.exit()',
      'nodes.n.output["x"]',
      'a+b',
      'trigger.email()',
      ''
    ]) {
      assert.equal(isSafePath(bad), false, bad);
      assert.equal(getPath({ trigger: {} }, bad), undefined);
    }
    // prototype pollution attempt resolves to undefined, not the prototype
    assert.equal(getPath({ a: 1 }, 'a.constructor'), undefined);
  });

  it('resolveDeep walks objects and arrays', () => {
    const ctx = buildContext({ triggerData: { name: 'Bo' } });
    assert.deepEqual(
      resolveDeep({ a: '{{trigger.name}}', b: ['x{{trigger.name}}', 1], c: { d: 2 } }, ctx),
      { a: 'Bo', b: ['xBo', 1], c: { d: 2 } }
    );
  });

  it('lists and validates expressions', () => {
    const v = { t: 'Hi {{trigger.name}} and {{nodes.a.output}}' };
    assert.deepEqual(listExpressions(v), ['trigger.name', 'nodes.a.output']);
    assert.equal(validateExpressions(v).ok, true);
    assert.equal(validateExpressions({ t: '{{a; evil()}}' }).ok, false);
  });
});
