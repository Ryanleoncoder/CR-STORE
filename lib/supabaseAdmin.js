import { createClient } from "@supabase/supabase-js";

export function getAdminClient() {
  
  const chave =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(process.env.SUPABASE_URL, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAdmin(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return { error: "Token ausente", status: 401 };

  const admin = getAdminClient();

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return { error: "Não autenticado", status: 401 };

  const { data: userCargos } = await admin
    .from("usuario_cargos")
    .select("cargos!inner(codigo)")
    .eq("usuario_id", user.id);

  const codigos = (userCargos ?? []).map(uc => uc.cargos?.codigo);
  const temPermissao = codigos.some(c => ["admin", "estoque", "campanhas"].includes(c));

  if (!temPermissao) {
    return { error: "Acesso restrito", status: 403 };
  }

  return { admin, user, roles: codigos };
}
