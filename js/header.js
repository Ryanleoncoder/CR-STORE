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
      <button id="sair" class="link">Sair</button>
    </div>`;

  document.querySelector("#sair").addEventListener("click", logout);

  const { data } = await supabase.from("carteiras").select("saldo").single();
  document.querySelector("#coins").innerHTML = `${COIN_SVG} ${data?.saldo ?? 0}`;

  const notifBtn = document.querySelector("#notif-btn");
  const notifDropdown = document.querySelector("#notif-dropdown");
  const notifBadge = document.querySelector("#notif-badge");
  const notifLista = document.querySelector("#notif-lista");
  const notifLimpar = document.querySelector("#notif-limpar");

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
      notifBadge.hidden = true;
      return;
    }

    const newest = transacoes[0].criado_em;
    const seen = localStorage.getItem(SEEN_KEY);
    notifBadge.hidden = !!(seen && new Date(seen) >= new Date(newest));

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

  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = notifDropdown.hidden;
    notifDropdown.hidden = !isHidden;
    if (!isHidden) return;
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    notifBadge.hidden = true;
  });

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
      notifBadge.hidden = true;
    });
  }
}
