import { getAdminClient } from "../../lib/supabaseAdmin.js";

const DIAS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.authorization !== `Bearer ${segredo}`) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const admin = getAdminClient();
  const agora = new Date();
  const resultado = { whitelist: 0, transacoes: 0, contas: 0 };

  try {
    
    const { data: wlDel, error: wlErr } = await admin
      .from("whitelist")
      .delete()
      .lt("expira_em", agora.toISOString())
      .select("id");
    if (wlErr) throw wlErr;
    resultado.whitelist = wlDel?.length || 0;

   
    const umAno = new Date(agora.getTime() - 365 * DIAS).toISOString();
    const { data: txDel, error: txErr } = await admin
      .from("transacoes_carteira")
      .delete()
      .lt("criado_em", umAno)
      .select("id");
    if (txErr) throw txErr;
    resultado.transacoes = txDel?.length || 0;

    const trintaDias = new Date(agora.getTime() - 30 * DIAS).toISOString();
    const { data: contas, error: contasErr } = await admin
      .from("usuarios")
      .select("id")
      .eq("primeiro_acesso_concluido", false)
      .lt("criado_em", trintaDias);
    if (contasErr) throw contasErr;

    for (const c of contas || []) {

      const { error: delErr } = await admin.auth.admin.deleteUser(c.id);
      if (!delErr) resultado.contas++;
    }

    return res.status(200).json({ ok: true, ...resultado });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro na limpeza", ...resultado });
  }
}
