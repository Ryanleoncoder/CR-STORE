import { requireAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { admin, roles } = auth;

  if (!roles.includes("admin") && !roles.includes("estoque")) {
    return res.status(403).json({ error: "Acesso restrito" });
  }

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("pedidos")
      .select(`
        id, status, total, criado_em,
        usuarios(nome, email),
        pedido_itens(id, quantidade, preco_unitario, produtos(nome, imagem_url))
      `)
      .order("criado_em", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "PUT") {
    const { pedido_id, status } = req.body || {};
    if (!pedido_id || !status) {
      return res.status(400).json({ error: "Informe o pedido_id e o status" });
    }

    const validStatuses = ["pendente", "confirmado", "cancelado", "entregue"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Status inválido" });
    }

    const { error } = await admin
      .from("pedidos")
      .update({ status })
      .eq("id", pedido_id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método não permitido" });
}
