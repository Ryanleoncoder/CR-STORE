import { getPublicClient, setRefreshCookie } from "../../lib/authCookies.js";

// httpOnly.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const refresh_token = req.body?.refresh_token;
  if (!refresh_token) return res.status(400).json({ error: "Token ausente" });

  const supabase = getPublicClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error || !data?.session) {
    return res.status(401).json({ error: "Sessão inválida" });
  }

  setRefreshCookie(req, res, data.session.refresh_token);
  return res.status(200).json({
    access_token: data.session.access_token,
    expires_at: data.session.expires_at,
  });
}
