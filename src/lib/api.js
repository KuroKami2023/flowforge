import { supabase } from './supabaseClient.js';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Same-origin API call with the Supabase JWT attached. */
export async function apiFetch(path, { method = 'GET', body, query } = {}) {
  const url = query ? `${path}?${new URLSearchParams(query).toString()}` : path;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    const err = new Error(`API unreachable (${path}). If running locally, start it with "vercel dev" instead of "npm run dev" so /api routes exist.`);
    err.status = 0;
    throw err;
  }
  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  if (data == null) {
    const err = new Error(
      !res.ok
        ? `Request failed (${res.status}).`
        : `API ${path} did not return JSON (got ${res.status}). If running locally, use "vercel dev" instead of "npm run dev" so /api routes exist.`
    );
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status}).`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  listWorkflows: () => apiFetch('/api/workflows'),
  createWorkflow: (payload) => apiFetch('/api/workflows', { method: 'POST', body: payload }),
  getWorkflow: (id) => apiFetch(`/api/workflows/${id}`),
  updateWorkflow: (id, payload) => apiFetch(`/api/workflows/${id}`, { method: 'PUT', body: payload }),
  deleteWorkflow: (id) => apiFetch(`/api/workflows/${id}`, { method: 'DELETE' }),
  duplicateWorkflow: (id) => apiFetch(`/api/workflows/${id}`, { method: 'POST', query: { action: 'duplicate' } }),
  executeWorkflow: (id, input) => apiFetch(`/api/workflows/${id}`, { method: 'POST', body: { input }, query: { action: 'execute' } }),
  listExecutions: (params) => apiFetch('/api/executions', { query: params }),
  getExecution: (id) => apiFetch(`/api/executions/${id}`),
  retryExecution: (id) => apiFetch(`/api/executions/${id}`, { method: 'POST', query: { action: 'retry' } }),
  dashboardStats: () => apiFetch('/api/dashboard/stats'),
  webhookInfo: (id) => apiFetch(`/api/workflows/${id}`, { query: { action: 'webhook' } }),
  rotateWebhookSecret: (id) => apiFetch(`/api/workflows/${id}`, { method: 'POST', query: { action: 'webhook' } }),
  getSchedule: (id) => apiFetch(`/api/workflows/${id}`, { query: { action: 'schedule' } }),
  saveSchedule: (id, payload) => apiFetch(`/api/workflows/${id}`, { method: 'PUT', body: payload, query: { action: 'schedule' } }),
  deleteSchedule: (id) => apiFetch(`/api/workflows/${id}`, { method: 'DELETE', query: { action: 'schedule' } }),
  testAi: (payload) => apiFetch('/api/ai/test', { method: 'POST', body: payload })
};
