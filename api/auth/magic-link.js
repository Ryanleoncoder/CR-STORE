import { getPublicClient } from "../../lib/authCookies.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const email = (req.body?.email || "").trim().toLowerCase();
  const redirectTo = req.body?.redirectTo || undefined;
  if (!email) return res.status(400).json({ error: "Informe o e-mail" });

  const supabase = getPublicClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (error) return res.status(400).json({ error: "Não foi possível enviar o e-mail." });

  return res.status(200).json({ ok: true });
}
