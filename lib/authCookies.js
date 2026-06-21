import { createClient } from "@supabase/supabase-js";

const COOKIE = "sb_refresh";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export function getPublicClient() {
  const chave =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  return createClient(process.env.SUPABASE_URL, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ehHttps(req) {
  return (req.headers["x-forwarded-proto"] || "").includes("https");
}

export function setRefreshCookie(req, res, refreshToken) {
  const partes = [
    `${COOKIE}=${encodeURIComponent(refreshToken)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${MAX_AGE}`,
  ];
  if (ehHttps(req)) partes.push("Secure");
  res.setHeader("Set-Cookie", partes.join("; "));
}

export function clearRefreshCookie(req, res) {
  const partes = [
    `${COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (ehHttps(req)) partes.push("Secure");
  res.setHeader("Set-Cookie", partes.join("; "));
}

export function readRefreshCookie(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)sb_refresh=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
