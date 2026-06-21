import { getPublicClient, setRefreshCookie } from "../../lib/authCookies.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const email = (req.body?.email || "").trim().toLowerCase();
  const token = req.body?.token;
  if (!email || !token) {
    return res.status(400).json({ error: "Informe e-mail e código" });
  }

  const supabase = getPublicClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data?.session) {
    return res.status(401).json({ error: "Código inválido ou expirado." });
  }

  setRefreshCookie(req, res, data.session.refresh_token);
  return res.status(200).json({
    access_token: data.session.access_token,
    expires_at: data.session.expires_at,
  });
}
