import { supabase, COIN_SVG } from "./supabase.js";
import { logout } from "./auth.js";


export async function montarHeader(ativo) {
  const header = document.querySelector("#topo");
  if (!header) return;
  header.className = "topo";


  header.innerHTML = `
    <a href="/loja" class="logo logo-topo"><span class="logo-cr">CR</span> <b>Store</b></a>
    <nav>
      <a href="/loja"${ativo === "loja" ? ' class="ativo"' : ""}>Loja</a>
      <a href="/desafios"${ativo === "desafios" ? ' class="ativo"' : ""}>Desafios</a>
      <a href="/carteira"${ativo === "carteira" ? ' class="ativo"' : ""}>Carteira</a>
      <a href="/meus-pedidos"${ativo === "pedidos" ? ' class="ativo"' : ""}>Meus pedidos</a>
    </nav>
    <div class="topo-dir">
      <div class="notif-wrapper">
        <button id="notif-btn" class="notif-btn" title="Notificações">
          <i class="ph-fill ph-bell"></i>
          <span id="notif-badge" class="notif-badge" hidden></span>
        </button>
        <div id="notif-dropdown" class="notif-dropdown" hidden>
          <div class="notif-dropdown-header">
            <h4>Notificações</h4>
            <button id="notif-limpar" class="link" style="font-size: 11px; color: var(--muted);">limpar</button>
          </div>
          <ul id="notif-lista" class="notif-lista">
            <li class="vazio">Nenhuma notificação recente.</li>
          </ul>
        </div>
      </div>
      <span class="coins" id="coins">${COIN_SVG} …</span>
      <div class="user-wrapper">
        <button id="user-btn" class="user-chip" title="Sua conta">
          <span class="user-av" id="user-av">?</span>
          <span id="user-handle">…</span>
        </button>
        <div id="user-dropdown" class="notif-dropdown account-menu" hidden>
          <div class="account-cover"></div>
          <div class="account-head">
            <span class="user-av lg" id="user-av-lg">?</span>
            <div class="account-id">
              <strong id="user-nome">—</strong>
              <div class="account-handle-row">
                <span id="user-handle-full" class="sub"></span>
                <button id="user-copiar" class="copiar-mini" type="button" title="Copiar usuário"><i class="ph-fill ph-copy"></i></button>
              </div>
            </div>
          </div>
          <div class="account-body">
            <button class="account-item" type="button" disabled><i class="ph-fill ph-user"></i> Perfil <span class="em-breve-tag">Em breve</span></button>
            <button class="account-item" type="button" disabled><i class="ph-fill ph-gear-six"></i> Configurações <span class="em-breve-tag">Em breve</span></button>
            <div class="account-sep"></div>
            <button id="sair" class="account-item account-sair" type="button"><i class="ph-fill ph-sign-out"></i> Sair</button>
          </div>
        </div>
      </div>
    </div>`;

  document.querySelector("#sair").addEventListener("click", logout);

  try {
    const c = JSON.parse(localStorage.getItem("cr_perfil") || "null");
    if (c) {
      const n = c.nome || "Você";
      document.querySelector("#user-handle").textContent = n;
      document.querySelector("#user-av").textContent = (n || c.username || "?")
        .trim()
        .charAt(0)
        .toUpperCase();
    }
  } catch {}

  const { data: cargos } = await supabase
    .from("usuario_cargos")
    .select("cargos!inner(codigo)")
    .in("cargos.codigo", ["admin", "estoque", "campanhas"]);
  const temAcessoAdmin = cargos && cargos.length > 0;

  if (temAcessoAdmin) {
    header.querySelector("nav")?.insertAdjacentHTML("beforeend", '<a href="/admin">Admin</a>');
  }

  if (!document.querySelector(".bottom-nav")) {
    const on = (sec) => (ativo === sec ? " on" : "");
    const bottomNav = document.createElement("nav");
    bottomNav.className = "bottom-nav";
    bottomNav.innerHTML = `
      <a href="/loja" class="bn-item${on("loja")}"><i class="ph-fill ph-storefront"></i><span>Loja</span></a>
      <a href="/desafios" class="bn-item${on("desafios")}"><i class="ph-fill ph-trophy"></i><span>Desafios</span></a>
      <a href="/carteira" class="bn-item${on("carteira")}"><i class="ph-fill ph-wallet"></i><span>Carteira</span></a>
      <a href="/meus-pedidos" class="bn-item${on("pedidos")}"><i class="ph-fill ph-receipt"></i><span>Pedidos</span></a>
      ${
        temAcessoAdmin
          ? `<a href="/admin" class="bn-item"><i class="ph-fill ph-gear"></i><span>Admin</span></a>`
          : `<button type="button" class="bn-item" id="bn-notif"><span class="bn-ico"><i class="ph-fill ph-bell"></i><span id="bn-badge" class="bn-badge" hidden></span></span><span>Notificações</span></button>`
      }`;
    document.body.appendChild(bottomNav);
    document.body.classList.add("com-bottom-nav");
    if (!temAcessoAdmin) document.body.classList.add("com-notif-bottom");
  }

  const { data } = await supabase.from("carteiras").select("saldo").single();
  document.querySelector("#coins").innerHTML = `${COIN_SVG} ${data?.saldo ?? 0}`;

  montarUsuario();

  const notifBtn = document.querySelector("#notif-btn");
  const notifDropdown = document.querySelector("#notif-dropdown");
  const notifBadge = document.querySelector("#notif-badge");
  const notifLista = document.querySelector("#notif-lista");
  const notifLimpar = document.querySelector("#notif-limpar");
  const bnNotif = document.querySelector("#bn-notif");
  const bnBadge = document.querySelector("#bn-badge");

  function setNotifBadge(hidden) {
    notifBadge.hidden = hidden;
    if (bnBadge) bnBadge.hidden = hidden;
  }

  function infoNotif(t) {
    if (t.tipo === "transferencia_recebida") {
      return {
        icon: "ph-gift",
        cor: "var(--pos)",
        msg: `Você recebeu <b>${t.valor} CRC</b>${t.descricao ? ` ("${t.descricao}")` : ""}`,
      };
    }
    if (t.tipo === "resgate_codigo") {
      return { icon: "ph-ticket", cor: "var(--pos)", msg: `Código resgatado: <b>+${t.valor} CRC</b>` };
    }
    const pos = t.valor >= 0;
    return {
      icon: pos ? "ph-plus-circle" : "ph-minus-circle",
      cor: pos ? "var(--pos)" : "var(--neg)",
      msg: `Ajuste da carteira: <b>${pos ? "+" : ""}${t.valor} CRC</b>`,
    };
  }

  const SEEN_KEY = "cr_notif_seen";

  async function carregarNotificacoes() {
    notifLista.innerHTML = Array(3).fill(0).map(() => `
      <li class="notif-item skeleton-row" style="border: none; padding: 10px 12px; gap: 8px;">
        <div class="skeleton" style="width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;"></div>
        <div class="notif-item-body skeleton-text">
          <div class="skeleton skeleton-line1" style="width: 80%; height: 10px;"></div>
          <div class="skeleton skeleton-line2" style="width: 50%; height: 8px; margin-top: 4px;"></div>
        </div>
      </li>
    `).join("");

    let limpoEm = null;
    try {
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("notif_limpo_em")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();
      limpoEm = perfil?.notif_limpo_em ?? null;
    } catch {}

    const limpoLocal = localStorage.getItem("cr_notif_cleared");
    if (limpoLocal && (!limpoEm || limpoLocal > limpoEm)) {
      limpoEm = limpoLocal;
    }

    let query = supabase
      .from("transacoes_carteira")
      .select("id, tipo, valor, descricao, criado_em")
      .in("tipo", ["transferencia_recebida", "ajuste_admin", "resgate_codigo"])
      .order("criado_em", { ascending: false })
      .limit(10);

    if (limpoEm) {
      query = query.gt("criado_em", limpoEm);
    }

    const { data: transacoes } = await query;

    if (!transacoes || transacoes.length === 0) {
      notifLista.innerHTML = `<li class="vazio">Nenhuma notificação recente.</li>`;
      setNotifBadge(true);
      return;
    }

    const newest = transacoes[0].criado_em;
    const seen = localStorage.getItem(SEEN_KEY);
    const jáViu = seen && new Date(seen) >= new Date(newest);
    setNotifBadge(!!jáViu);

    notifLista.innerHTML = transacoes
      .map((t) => {
        const { icon, cor, msg } = infoNotif(t);
        const dataStr = new Date(t.criado_em).toLocaleDateString("pt-BR", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `
          <li class="notif-item">
            <span class="notif-item-icon" style="color: ${cor};"><i class="ph-fill ${icon}"></i></span>
            <div class="notif-item-body">
              <p>${msg}</p>
              <span>${dataStr}</span>
            </div>
          </li>`;
      })
      .join("");
  }

  try { await carregarNotificacoes(); } catch {}

  supabase
    .channel("carteira-rt")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "transacoes_carteira" },
      (payload) => {
        carregarNotificacoes();
        const saldo = payload.new?.saldo_posterior;
        if (typeof saldo === "number") {
          document.querySelector("#coins").innerHTML = `${COIN_SVG} ${saldo}`;
        }
      }
    )
    .subscribe();

  function alternarNotif(e) {
    e.stopPropagation();
    const ud = document.querySelector("#user-dropdown");
    if (ud) ud.hidden = true; 
    const isHidden = notifDropdown.hidden;
    notifDropdown.hidden = !isHidden;
    if (!isHidden) return;
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    setNotifBadge(true);
  }
  notifBtn.addEventListener("click", alternarNotif);
  if (bnNotif) bnNotif.addEventListener("click", alternarNotif);

  document.addEventListener("click", () => {
    if (notifDropdown) notifDropdown.hidden = true;
  });

  if (notifDropdown) {
    notifDropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  if (notifLimpar) {
    notifLimpar.addEventListener("click", async () => {
    
      const agora = new Date().toISOString();
      notifLista.innerHTML = `<li class="vazio">Nenhuma notificação recente.</li>`;
      setNotifBadge(true);
      localStorage.setItem(SEEN_KEY, agora);
      localStorage.setItem("cr_notif_cleared", agora);

      try {
        const { getAccessToken } = await import("./auth-token.js");
        const token = await getAccessToken();
        if (token) {
          await fetch("/api/notificacoes", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {}
    });
  }

  async function montarUsuario() {
    const userBtn = document.querySelector("#user-btn");
    const userDropdown = document.querySelector("#user-dropdown");
    const PERFIL_KEY = "cr_perfil";

    function aplicarPerfil(nome, username) {
      const n = nome || "Você";
      document.querySelector("#user-handle").textContent = n;
      document.querySelector("#user-nome").textContent = n;
      document.querySelector("#user-handle-full").textContent = username
        ? `@${username}`
        : "Sem nome de usuário";
      const inicial = (n || username || "?").trim().charAt(0).toUpperCase();
      document.querySelector("#user-av").textContent = inicial;
      document.querySelector("#user-av-lg").textContent = inicial;
    }

    try {
      const c = JSON.parse(localStorage.getItem(PERFIL_KEY) || "null");
      if (c) aplicarPerfil(c.nome, c.username);
    } catch {}

    userBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notifDropdown.hidden = true; // só um dropdown aberto por vez
      userDropdown.hidden = !userDropdown.hidden;
    });
    userDropdown.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => (userDropdown.hidden = true));

    const { data: perfil } = await supabase
      .from("usuarios")
      .select("nome, username")
      .maybeSingle();

    const username = perfil?.username || null;
    const nome = perfil?.nome || "Você";
    aplicarPerfil(nome, username);
    try {
      localStorage.setItem(PERFIL_KEY, JSON.stringify({ nome, username }));
    } catch {}

    const copiar = document.querySelector("#user-copiar");
    copiar.hidden = !username;
    copiar.addEventListener("click", async () => {
      if (!username) return;
      try {
        await navigator.clipboard.writeText(username);
        const original = copiar.innerHTML;
        copiar.innerHTML = '<i class="ph-fill ph-check"></i>';
        copiar.title = "Copiado!";
        setTimeout(() => {
          copiar.innerHTML = original;
          copiar.title = "Copiar usuário";
        }, 1200);
      } catch {}
    });
  }
}
