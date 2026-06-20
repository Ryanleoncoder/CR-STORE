import { supabase } from "./supabase.js";

export async function requireAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "/";
    return null;
  }

  return session;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/";
}
