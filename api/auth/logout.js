import { clearRefreshCookie } from "../../lib/authCookies.js";

export default async function handler(req, res) {
  clearRefreshCookie(req, res);
  return res.status(200).json({ ok: true });
}
