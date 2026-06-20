import { getAdminClient } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const email = (req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password;

  if (!email) return res.status(400).json({ error: "Informe o e-mail" });
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres" });
  }

  const admin = getAdminClient();

  const { data: wl, error: wlError } = await admin
    .from("whitelist")
    .select("email, nome")
    .ilike("email", email)
    .eq("ativo", true)
    .maybeSingle();

  if (wlError) return res.status(500).json({ error: wlError.message });
  if (!wl) {
    return res.status(403).json({ error: "E-mail não autorizado. Fale com a Keila." });
  }

  const { data: uExist } = await admin
    .from("usuarios")
    .select("id, primeiro_acesso_concluido")
    .ilike("email", email)
    .maybeSingle();

  if (uExist && uExist.primeiro_acesso_concluido) {
    return res.status(400).json({ error: "Este e-mail já possui acesso cadastrado. Use a aba Entrar." });
  }

  try {
    const { data: authData, error: listError } = await admin.auth.admin.listUsers();
    if (listError) return res.status(500).json({ error: listError.message });

    const existingAuthUser = authData.users.find(u => u.email.toLowerCase() === email);

    let userId;
    if (!existingAuthUser) {
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
      });
      if (createError) return res.status(500).json({ error: createError.message });
      userId = newUser.user.id;
    } else {
      const { data: updatedUser, error: updateError } = await admin.auth.admin.updateUserById(
        existingAuthUser.id,
        { password: password, email_confirm: true }
      );
      if (updateError) return res.status(500).json({ error: updateError.message });
      userId = updatedUser.user.id;
    }

    const { error: profileError } = await admin
      .from("usuarios")
      .upsert({
        id: userId,
        email: email,
        nome: wl.nome || null,
        primeiro_acesso_concluido: true,
        ativo: true
      }, { onConflict: "id" });

    if (profileError) return res.status(500).json({ error: profileError.message });

    const { data: hasCargo } = await admin
      .from("usuario_cargos")
      .select("id")
      .eq("usuario_id", userId)
      .maybeSingle();

    if (!hasCargo) {
      const { data: defaultCargo } = await admin
        .from("cargos")
        .select("id")
        .eq("codigo", "cliente")
        .single();

      if (defaultCargo) {
        await admin.from("usuario_cargos").insert({
          usuario_id: userId,
          cargo_id: defaultCargo.id
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro interno do servidor" });
  }
}
