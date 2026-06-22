import { supabase, COIN_SVG } from "./supabase.js";
import { logout } from "./auth.js";


export async function montarHeader(ativo) {
  const header = document.querySelector("#topo");
  if (!header) return;
  header.className = "topo";

  const { data: cargos } = await supabase
    .from("usuario_cargos")
    .select("cargos!inner(codigo)")
    .in("cargos.codigo", ["admin", "estoque", "campanhas"]);

  const temAcessoAdmin = cargos && cargos.length > 0;

  header.innerHTML = `
    <a href="/loja" class="logo logo-topo">CR <b>Store</b></a>
    <nav>
      <a href="/loja"${ativo === "loja" ? ' class="ativo"' : ""}>Loja</a>
      <a href="/desafios"${ativo === "desafios" ? ' class="ativo"' : ""}>Desafios</a>
      <a href="/carteira"${ativo === "carteira" ? ' class="ativo"' : ""}>Carteira</a>
      <a href="/meus-pedidos"${ativo === "pedidos" ? ' class="ativo"' : ""}>Meus pedidos</a>
      ${temAcessoAdmin ? '<a href="/admin">Admin</a>' : ""}
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
        <button id="user-btn" class="user-chip" title="Seu usuário">
          <i class="ph-fill ph-user-circle"></i>
          <span id="user-handle">@…</span>
        </button>
        <div id="user-dropdown" class="notif-dropdown user-dropdown" hidden>
          <div class="user-card">
            <strong id="user-nome">—</strong>
            <span id="user-handle-full" class="sub"></span>
            <button id="user-copiar" class="link"><i class="ph-fill ph-copy"></i> Copiar usuário</button>
          </div>
        </div>
      </div>
      <button id="sair" class="link">Sair</button>
    </div>`;

  document.querySelector("#sair").addEventListener("click", logout);

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

  const CLEARED_KEY = "cr_notif_cleared";
  const SEEN_KEY = "cr_notif_seen";

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

    const cleared = localStorage.getItem(CLEARED_KEY);
    let query = supabase
      .from("transacoes_carteira")
      .select("id, tipo, valor, descricao, criado_em")
      .in("tipo", ["transferencia_recebida", "ajuste_admin", "resgate_codigo"])
      .order("criado_em", { ascending: false })
      .limit(15);
    if (cleared) query = query.gt("criado_em", cleared);

    const { data: transacoes } = await query;

    if (!transacoes || transacoes.length === 0) {
      notifLista.innerHTML = `<li class="vazio">Nenhuma notificação recente.</li>`;
      setNotifBadge(true);
      return;
    }

    const newest = transacoes[0].criado_em;
    const seen = localStorage.getItem(SEEN_KEY);
    setNotifBadge(!!(seen && new Date(seen) >= new Date(newest)));

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

  await carregarNotificacoes();

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
    notifLimpar.addEventListener("click", () => {
      const agora = new Date().toISOString();
      localStorage.setItem(CLEARED_KEY, agora);
      localStorage.setItem(SEEN_KEY, agora);
      notifLista.innerHTML = `<li class="vazio">Nenhuma notificação recente.</li>`;
      setNotifBadge(true);
    });
  }

  async function montarUsuario() {
    const userBtn = document.querySelector("#user-btn");
    const userDropdown = document.querySelector("#user-dropdown");

    const { data: perfil } = await supabase
      .from("usuarios")
      .select("nome, username")
      .maybeSingle();

    const username = perfil?.username || null;
    const nome = perfil?.nome || "Você";

    document.querySelector("#user-handle").textContent = nome;
    document.querySelector("#user-nome").textContent = nome;
    document.querySelector("#user-handle-full").textContent = username
      ? `@${username}`
      : "Sem nome de usuário";

    userBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.hidden = !userDropdown.hidden;
    });
    userDropdown.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => (userDropdown.hidden = true));

    const copiar = document.querySelector("#user-copiar");
    copiar.hidden = !username;
    copiar.addEventListener("click", async () => {
      if (!username) return;
      try {
        await navigator.clipboard.writeText(username);
        const original = copiar.innerHTML;
        copiar.innerHTML = '<i class="ph-fill ph-check"></i> Copiado!';
        setTimeout(() => (copiar.innerHTML = original), 1200);
      } catch {}
    });
  }
}
