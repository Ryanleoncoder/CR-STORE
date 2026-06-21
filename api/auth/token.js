import {
  getPublicClient,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from "../../lib/authCookies.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const refresh = readRefreshCookie(req);
  if (!refresh) return res.status(401).json({ error: "Sem sessão" });

  const supabase = getPublicClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refresh });
  if (error || !data?.session) {
    clearRefreshCookie(req, res);
    return res.status(401).json({ error: "Sessão expirada" });
  }

  setRefreshCookie(req, res, data.session.refresh_token);
  return res.status(200).json({
    access_token: data.session.access_token,
    expires_at: data.session.expires_at,
  });
}
