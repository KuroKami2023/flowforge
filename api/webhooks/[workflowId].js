import { hWebhookIngress } from '../_lib/handlers.js';

export default function handler(req, res) {
  return hWebhookIngress(req, res);
}
