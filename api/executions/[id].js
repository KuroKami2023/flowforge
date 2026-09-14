import { hExecutionGet, hExecutionRetry } from '../_lib/handlers.js';
import { send } from '../_lib/auth.js';

export default function handler(req, res) {
  if (req.method === 'POST' && req.query?.action === 'retry') {
    return hExecutionRetry(req, res);
  }
  if (req.method === 'GET' && !req.query?.action) {
    return hExecutionGet(req, res);
  }
  return send(res, 405, { error: 'Method not allowed.' });
}
