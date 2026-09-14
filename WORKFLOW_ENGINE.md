# WORKFLOW_ENGINE

Implemented in `api/_lib/executionEngine.js` (+ `nodeExecutors.js`, `variables.js`).
This is a real orchestrator, not a mockup: it validates, orders, executes,
propagates data, retries, persists and reports.

## The 11 steps

1. **Load** — the route fetches the workflow (ownership-checked) and passes its
   `definition` in.
2. **Validate** — `validateWorkflow()` rejects unknown types, duplicate ids, bad
   references, self-loops, cycles, trigger-less graphs and per-type missing
   config (e.g. `http_request` without `url`).
3. **Build execution order** — `buildExecutionOrder()` (Kahn's algorithm) gives a
   topological order for views/tests; the runner itself does branch-aware BFS
   from trigger nodes so `condition true/false` and `switch case/default` only
   walk the taken path. Each node runs at most once (`visited` set, `MAX_STEPS`
   guard).
4. **Execute sequentially** — `executeNode()` resolves `inputMapping` +
   `config` templates against the context, then calls the node's executor.
5. **Pass outputs downstream** — results land at `context.nodes[<nodeId>].output`,
   so later nodes read `{{nodes.http_request.output}}`. Full-string expressions
   preserve types (objects stay objects).
6. **Store execution state** — the route persists each node via `onNodeComplete`
   (`workflow_execution_nodes`) and opens/closes a `workflow_executions` row.
7. **Handle errors** — per-node `errorHandling`: `onError: stop | continue`,
   `retryCount` (0–5), `retryDelayMs` (capped for serverless).
8. **Retry configured nodes** — transient NVIDIA (429/5xx) and timeout errors are
   marked retryable; the loop sleeps (capped 5 s) and re-attempts.
9. **Stop when required** — fatal error with `onError: stop`, a node's `stop`
   flag (e.g. after `webhook_response`), the 55 s execution budget or step cap.
10. **Save execution logs** — status, input/output, timings, attempts, errors.
11. **Return the final result** — `{ status, output, errors, durationMs,
    nodeResults, executionResponse }`.

## Execution record shape

```
execution ID · workflow ID · status (running|success|failed)
start time · end time · duration ms · trigger type · input
node results: { [nodeId]: { status, output, error, attempts, durationMs } }
errors: [{ nodeId?, nodeType?, message, attempts? }]
```

## Limits (free-tier friendly)

50 nodes · 100 connections · 5 retries · 55 s execution budget · 200 steps ·
15 s HTTP timeout · 60 s AI timeout · 256 KB webhook payload.
