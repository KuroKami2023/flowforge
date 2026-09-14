import { hCronCheck } from '../_lib/handlers.js';

export default function handler(req, res) {
  return hCronCheck(req, res);
}
