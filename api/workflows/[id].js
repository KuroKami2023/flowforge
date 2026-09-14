import {
  hWorkflowDetail,
  hWorkflowDuplicate,
  hWorkflowExecute,
  hWorkflowSchedule,
  hWorkflowWebhook
} from '../_lib/handlers.js';
import { send } from '../_lib/auth.js';

export default function handler(req, res) {
  const action = req.query?.action;
  if (req.method === 'POST' && action === 'duplicate') {
    return hWorkflowDuplicate(req, res);
  }
  if (req.method === 'POST' && action === 'execute') {
    return hWorkflowExecute(req, res);
  }
  if (action === 'schedule') {
    return hWorkflowSchedule(req, res);
  }
  if (action === 'webhook') {
    return hWorkflowWebhook(req, res);
  }
  if (!action) {
    return hWorkflowDetail(req, res);
  }
  return send(res, 404, { error: 'Not found.' });
}
