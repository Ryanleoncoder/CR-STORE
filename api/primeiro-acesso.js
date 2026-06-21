import { getAdminClient } from "../lib/supabaseAdmin.js";

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

function normalizarUsername(u) {
  return (u || "").trim().toLowerCase().replace(/^@+/, "");
}

export default async function handler(req, res) {
  const admin = getAdminClient();

  
  if (req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Informe o e-mail" });

    const { data: wl } = await admin
      .from("whitelist")
      .select("nome, username")
      .ilike("email", email)
      .eq("ativo", true)
      .maybeSingle();

    return res.status(200).json({
      precisaNome: !(wl && wl.nome),
      precisaUsername: !(wl && wl.username),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const email = (req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password;

  if (!email) return res.status(400).json({ error: "Informe o e-mail" });
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres" });
  }

  const { data: wl, error: wlError } = await admin
    .from("whitelist")
    .select("email, nome, username")
    .ilike("email", email)
    .eq("ativo", true)
    .maybeSingle();

  if (wlError) return res.status(500).json({ error: wlError.message });
  if (!wl) {
    return res.status(403).json({ error: "E-mail não autorizado. Fale com a Keila." });
  }

  
  let nome = (wl.nome || "").trim() || null;
  if (!nome) {
    nome = (req.body?.nome || "").trim() || null;
    if (!nome) return res.status(400).json({ error: "Informe seu nome.", precisaNome: true });
  }

  let username = wl.username || null;
  if (!username) {
    username = normalizarUsername(req.body?.username);
    if (!username) {
      return res.status(400).json({ error: "Escolha um nome de usuário.", precisaUsername: true });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: "Usuário inválido: use 3 a 20 caracteres (letras, números, ponto ou _).",
        precisaUsername: true,
      });
    }
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
        email_confirm: true,
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

    if (!wl.username) {
      const { data: jaUsado } = await admin
        .from("usuarios")
        .select("id")
        .eq("username", username)
        .neq("id", userId)
        .maybeSingle();
      if (jaUsado) {
        return res.status(409).json({ error: "Esse nome de usuário já está em uso.", precisaUsername: true });
      }
    }

    const { error: profileError } = await admin
      .from("usuarios")
      .upsert({
        id: userId,
        email: email,
        nome: nome,
        username: username,
        primeiro_acesso_concluido: true,
        ativo: true,
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
          cargo_id: defaultCargo.id,
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro interno do servidor" });
  }
}
