import { getAccessToken, clearAccessToken } from "./auth-token.js";

function lerUserId(token) {
  try {
    let b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return JSON.parse(atob(b)).sub || null;
  } catch {
    return null;
  }
}

export async function requireAuth() {
  const token = await getAccessToken();
  if (!token) {
    const destino = window.location.pathname + window.location.search;
    window.location.href = "/?redirect=" + encodeURIComponent(destino);
    return null;
  }
  return { access_token: token, user: { id: lerUserId(token) } };
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  clearAccessToken();
  try {
    localStorage.removeItem("cr_perfil");
  } catch {}
  window.location.href = "/";
}
