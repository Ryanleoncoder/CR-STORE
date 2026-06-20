import { requireAdmin } from "../lib/supabaseAdmin.js";


export default async function handler(req, res) {
  const auth = await requireAdmin(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { admin, roles } = auth;

  if (!roles.includes("admin")) {
    return res.status(403).json({ error: "Acesso restrito a administradores" });
  }

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("usuarios")
      .select(`
        id, nome, username, email, ativo, criado_em,
        carteiras(saldo),
        usuario_cargos(cargos(codigo, nome)),
        pedidos(id, status)
      `)
      .order("criado_em", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const emails = req.body?.emails;
    if (Array.isArray(emails)) {
      const insertData = emails
        .map((x) => ({
          email: (x.email || "").trim().toLowerCase(),
          nome: x.nome ? x.nome.trim() : null,
          ativo: true,
        }))
        .filter((x) => x.email);

      if (insertData.length === 0) {
        return res.status(400).json({ error: "Nenhum e-mail válido fornecido" });
      }

      const { error } = await admin
        .from("whitelist")
        .upsert(insertData, { onConflict: "email" });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ ok: true, count: insertData.length });
    }

    const email = (req.body?.email || "").trim().toLowerCase();
    const nome = req.body?.nome ?? null;
    if (!email) return res.status(400).json({ error: "Informe o e-mail" });

    const { error } = await admin
      .from("whitelist")
      .upsert({ email, nome, ativo: true }, { onConflict: "email" });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const usuarioId = req.body?.usuario_id;
    if (!usuarioId) return res.status(400).json({ error: "Informe o usuario_id" });
    if (usuarioId === auth.user.id) {
      return res.status(400).json({ error: "Você não pode desativar a própria conta" });
    }

    const { data: u } = await admin
      .from("usuarios")
      .select("email")
      .eq("id", usuarioId)
      .maybeSingle();

    const { error } = await admin
      .from("usuarios")
      .update({ ativo: false })
      .eq("id", usuarioId);
    if (error) return res.status(500).json({ error: error.message });

    if (u?.email) {
      await admin.from("whitelist").update({ ativo: false }).eq("email", u.email);
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    const { usuario_id, cargo_codigo } = req.body || {};
    if (!usuario_id || !cargo_codigo) {
      return res.status(400).json({ error: "Informe usuario_id e cargo_codigo" });
    }
    if (usuario_id === auth.user.id) {
      return res.status(400).json({ error: "Você não pode mudar o próprio cargo" });
    }

    const { data: cargo } = await admin
      .from("cargos")
      .select("id")
      .eq("codigo", cargo_codigo)
      .maybeSingle();
    if (!cargo) return res.status(400).json({ error: "Cargo inválido" });

    // Substitui o cargo do usuário pelo escolhido (cargo único por usuário)
    await admin.from("usuario_cargos").delete().eq("usuario_id", usuario_id);
    const { error } = await admin
      .from("usuario_cargos")
      .insert({ usuario_id, cargo_id: cargo.id });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método não permitido" });
}
