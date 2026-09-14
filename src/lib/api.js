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
  duplicateWorkflow: (id) => apiFetch(`/api/workflows/${id}/duplicate`, { method: 'POST' }),
  executeWorkflow: (id, input) => apiFetch(`/api/workflows/${id}/execute`, { method: 'POST', body: { input } }),
  listExecutions: (params) => apiFetch('/api/executions', { query: params }),
  getExecution: (id) => apiFetch(`/api/executions/${id}`),
  retryExecution: (id) => apiFetch(`/api/executions/${id}/retry`, { method: 'POST' }),
  dashboardStats: () => apiFetch('/api/dashboard/stats'),
  webhookInfo: (id) => apiFetch(`/api/workflows/${id}/webhook`),
  rotateWebhookSecret: (id) => apiFetch(`/api/workflows/${id}/webhook`, { method: 'POST' }),
  getSchedule: (id) => apiFetch(`/api/workflows/${id}/schedule`),
  saveSchedule: (id, payload) => apiFetch(`/api/workflows/${id}/schedule`, { method: 'PUT', body: payload }),
  deleteSchedule: (id) => apiFetch(`/api/workflows/${id}/schedule`, { method: 'DELETE' }),
  testAi: (payload) => apiFetch('/api/ai/test', { method: 'POST', body: payload })
};
