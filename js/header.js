import { supabase, COIN_SVG } from "./supabase.js";
import { logout, requireAuth } from "./auth.js";


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
          <span id="user-av-container"><span class="user-av" id="user-av">?</span></span>
          <span id="user-handle">…</span>
        </button>
        <div id="user-dropdown" class="notif-dropdown account-menu" hidden>
          <div class="account-cover"></div>
          <div class="account-head">
            <span id="user-av-lg-container" title="Alterar avatar"><span class="user-av lg" id="user-av-lg">?</span><span class="avatar-edit-overlay"><i class="ph-fill ph-pencil-simple"></i></span></span>
            <div class="account-id">
              <strong id="user-nome">—</strong>
              <div class="account-handle-row">
                <span id="user-handle-full" class="sub"></span>
                <button id="user-copiar" class="copiar-mini" type="button" title="Copiar usuário"><i class="ph-fill ph-copy"></i></button>
              </div>
            </div>
          </div>
          <div class="account-body">
            <button class="account-item" type="button" id="btn-abrir-perfil"><i class="ph-fill ph-user"></i> Perfil <span class="beta-tag">BETA</span></button>
            <button class="account-item" type="button" disabled><i class="ph-fill ph-gear-six"></i> Configurações <span class="em-breve-tag">Em breve</span></button>
            <div class="account-sep"></div>
            <button id="sair" class="account-item account-sair" type="button"><i class="ph-fill ph-sign-out"></i> Sair</button>
          </div>
        </div>
      </div>
    </div>`;

  document.querySelector("#sair").addEventListener("click", logout);

  const PERFIL_KEY = "cr_perfil";
  let activeUsername = null;

  function aplicarPerfil(nome, username, avatar_url) {
    const n = nome || "Você";
    activeUsername = username || null;

    const userHandle = document.querySelector("#user-handle");
    const userNome = document.querySelector("#user-nome");
    const userHandleFull = document.querySelector("#user-handle-full");
    const avContainer = document.querySelector("#user-av-container");
    const avLgContainer = document.querySelector("#user-av-lg-container");
    const copiar = document.querySelector("#user-copiar");

    if (userHandle) userHandle.textContent = n;
    if (userNome) userNome.textContent = n;
    if (userHandleFull) {
      userHandleFull.textContent = username
        ? `@${username}`
        : "Sem nome de usuário";
    }
    if (copiar) {
      copiar.hidden = !activeUsername;
    }

    if (avatar_url) {
      if (avContainer) avContainer.innerHTML = `<img class="user-av" src="${avatar_url}" alt="Avatar" />`;
      if (avLgContainer) {
        avLgContainer.innerHTML = `
          <img class="user-av lg" id="user-av-lg" src="${avatar_url}" alt="Avatar" />
          <span class="avatar-edit-overlay"><i class="ph-fill ph-pencil-simple"></i></span>
        `;
      }
    } else {
      const inicial = (n || username || "?").trim().charAt(0).toUpperCase();
      if (avContainer) avContainer.innerHTML = `<span class="user-av">${inicial}</span>`;
      if (avLgContainer) {
        avLgContainer.innerHTML = `
          <span class="user-av lg" id="user-av-lg">${inicial}</span>
          <span class="avatar-edit-overlay"><i class="ph-fill ph-pencil-simple"></i></span>
        `;
      }
    }
  }

  try {
    const c = JSON.parse(localStorage.getItem(PERFIL_KEY) || "null");
    if (c) aplicarPerfil(c.nome, c.username, c.avatar_url);
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
      const session = await requireAuth();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("notif_limpo_em")
        .eq("id", userId)
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

    userBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notifDropdown.hidden = true; // só um dropdown aberto por vez
      userDropdown.hidden = !userDropdown.hidden;
    });
    userDropdown.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => (userDropdown.hidden = true));

    // Busca o perfil atualizado e renova o cache em segundo plano.
    const { data: perfil } = await supabase
      .from("usuarios")
      .select("nome, username, avatar_url")
      .maybeSingle();

    if (perfil) {
      const username = perfil.username || null;
      const nome = perfil.nome || "Você";
      const db_avatar_url = perfil.avatar_url || null;

      // Lê o cache atual
      let cached = null;
      try {
        cached = JSON.parse(localStorage.getItem(PERFIL_KEY) || "null");
      } catch {}

      // Só atualiza a UI e o cache se algo de fato mudou (evita requisição de rede e flicker ao trocar de página)
      const nomeMudou = !cached || cached.nome !== nome;
      const userMudou = !cached || cached.username !== username;
      const avatarMudou = !cached || cached.dicebear_url !== db_avatar_url;

      if (nomeMudou || userMudou || avatarMudou) {
        const urlParaAplicar = avatarMudou ? db_avatar_url : (cached ? cached.avatar_url : db_avatar_url);
        
        aplicarPerfil(nome, username, urlParaAplicar);
        
        try {
          localStorage.setItem(
            PERFIL_KEY,
            JSON.stringify({
              nome,
              username,
              avatar_url: urlParaAplicar,
              dicebear_url: db_avatar_url
            })
          );
        } catch {}
      }
    }

    // Injeta o modal do perfil se não existir na página
    let modalPerfil = document.querySelector("#modal-perfil");
    if (!modalPerfil) {
      modalPerfil = document.createElement("div");
      modalPerfil.id = "modal-perfil";
      modalPerfil.className = "modal-bg";
      modalPerfil.hidden = true;
      modalPerfil.innerHTML = `
        <div class="modal modal-perfil-content" style="max-width: 550px;">
          <div class="modal-head">
            <h3>Editar Perfil</h3>
            <button class="modal-close" id="btn-fechar-perfil">✕</button>
          </div>
          <div class="modal-body">
            <form id="perfil-form" style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
              <div class="perfil-grid">
                <!-- Lado Esquerdo: Preview -->
                <div class="perfil-preview-side">
                  <div class="perfil-avatar-frame" id="perfil-avatar-preview-container">
                    <img id="perfil-avatar-preview" src="https://api.dicebear.com/10.x/big-smile/svg?seed=kdl7urbo" alt="Preview" />
                  </div>
                  <button type="button" id="btn-aleatorio-avatar" class="btn-secundario" style="padding: 6px 12px; font-size: 12px; display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                    <i class="ph-fill ph-shuffle"></i> Aleatório
                  </button>

                  <!-- Compartilhamento de Código -->
                  <div class="share-code-box" style="margin-top: 10px; width: 100%; display: flex; flex-direction: column; gap: 4px; border-top: 1px dashed var(--border); padding-top: 10px;">
                    <label style="font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">Código da Combinação</label>
                    <div style="display: flex; gap: 4px; width: 100%;">
                      <input id="avatar-share-code" type="text" placeholder="Cole um código aqui..." style="padding: 4px 8px; font-size: 11px; text-align: center; border-radius: 8px; height: 28px; background: var(--surface); border: 1px solid var(--border); width: 100%;" title="Copie ou cole um código para alterar o avatar" />
                      <button type="button" id="btn-copiar-share-code" class="btn-secundario" style="padding: 0 8px; height: 28px; font-size: 11px;" title="Copiar código"><i class="ph-fill ph-copy"></i></button>
                    </div>
                    <span style="font-size: 9px; color: var(--muted); text-align: center; margin-top: 2px; line-height: 1.2;">
                      💡 Dica: Cole o código de um amigo aqui para carregar o avatar dele!
                    </span>
                  </div>

                  <div class="avatar-credit" style="margin-top: 8px;">
                    O estilo Big Smile é uma remixagem de: <br/>
                    <a href="https://www.figma.com/community/file/881358461963645496/custom-avatar" target="_blank" rel="noopener noreferrer">Custom Avatar</a> por 
                    <a href="https://www.ashleyseo.com/" target="_blank" rel="noopener noreferrer">Ashley Seo</a> 
                    (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>).
                  </div>
                </div>
                
                <!-- Lado Direito: Controles -->
                <div class="perfil-controls-side">
                  <div class="field">
                    <label for="perfil-nome">Nome</label>
                    <input id="perfil-nome" type="text" placeholder="Seu nome" required />
                  </div>
                  <hr style="border: none; border-top: 1px solid var(--border); margin: 8px 0;" />
                  <h4 style="margin: 0; font-size: 13px; font-weight: 700; color: var(--ink);">Personalizar Avatar (Big Smile)</h4>
                  
                  <div class="field">
                    <label for="avatar-skin">Cor da Pele</label>
                    <select id="avatar-skin">
                      <option value="efb18a">Padrão</option>
                      <option value="f5c9a6">Clara 1</option>
                      <option value="ffdcb3">Clara 2</option>
                      <option value="e49f7a">Média 1</option>
                      <option value="b1795b">Média 2</option>
                      <option value="79472e">Escura 1</option>
                      <option value="4b2413">Escura 2</option>
                    </select>
                  </div>
                  
                  <div class="field">
                    <label for="avatar-hair">Cabelo</label>
                    <select id="avatar-hair">
                      <option value="straightHair">Liso Padrão</option>
                      <option value="shortHair">Curto Padrão</option>
                      <option value="bangs">Franja</option>
                      <option value="bowlCutHair">Corte Tigela</option>
                      <option value="braids">Tranças</option>
                      <option value="bunHair">Coque</option>
                      <option value="curlyBob">Bob Cacheado</option>
                      <option value="curlyShortHair">Curto Cacheado</option>
                      <option value="froBun">Afro com Coque</option>
                      <option value="halfShavedHead">Semi-raspado</option>
                      <option value="mohawk">Moicano</option>
                      <option value="shavedHead">Raspado</option>
                      <option value="wavyBob">Ondulado</option>
                    </select>
                  </div>
                  
                  <div class="field">
                    <label for="avatar-hair-color">Cor do Cabelo</label>
                    <select id="avatar-hair-color">
                      <option value="220f00">Preto</option>
                      <option value="3a1a00">Castanho Escuro</option>
                      <option value="71472d">Castanho</option>
                      <option value="e2ba87">Loiro</option>
                      <option value="605de4">Roxo</option>
                      <option value="238d80">Azul Piscina</option>
                      <option value="e92c2c">Vermelho</option>
                    </select>
                  </div>
                  
                  <div class="field">
                    <label for="avatar-eyes">Olhos</label>
                    <select id="avatar-eyes">
                      <option value="normal">Padrão</option>
                      <option value="cheery">Alegre</option>
                      <option value="confused">Confuso</option>
                      <option value="angry">Bravo</option>
                      <option value="sad">Triste</option>
                      <option value="sleepy">Sonolento</option>
                      <option value="starstruck">Brilho nos Olhos</option>
                      <option value="winking">Piscadela</option>
                    </select>
                  </div>
                  
                  <div class="field">
                    <label for="avatar-mouth">Boca</label>
                    <select id="avatar-mouth">
                      <option value="openedSmile">Sorriso Aberto</option>
                      <option value="awkwardSmile">Sorriso Sem Jeito</option>
                      <option value="braces">Aparelho</option>
                      <option value="gapSmile">Sorriso com Janelinha</option>
                      <option value="kawaii">Fofo / Kawaii</option>
                      <option value="openSad">Triste</option>
                      <option value="teethSmile">Sorriso Dentuço</option>
                      <option value="unimpressed">Sério</option>
                    </select>
                  </div>
                  
                  <div class="field">
                    <label for="avatar-accessory">Acessório</label>
                    <select id="avatar-accessory">
                      <option value="">Nenhum</option>
                      <option value="glasses">Óculos de Grau</option>
                      <option value="sunglasses">Óculos de Sol</option>
                      <option value="mustache">Bigode</option>
                      <option value="catEars">Orelhas de Gato</option>
                      <option value="clownNose">Nariz de Palhaço</option>
                      <option value="faceMask">Máscara Facial</option>
                      <option value="sleepMask">Máscara de Dormir</option>
                      <option value="sailormoonCrown">Coroa Lunar</option>
                    </select>
                  </div>
                  
                  <div class="field">
                    <label for="avatar-bg">Fundo</label>
                    <select id="avatar-bg">
                      <option value="4bdb24">Verde</option>
                      <option value="22d3ee">Ciano</option>
                      <option value="c084fc">Roxo</option>
                      <option value="f472b6">Rosa</option>
                      <option value="fb923c">Laranja</option>
                      <option value="facc15">Amarelo</option>
                      <option value="38bdf8">Azul</option>
                      <option value="94a3b8">Cinza</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <p id="perfil-aviso" class="aviso"></p>
              <button type="submit" id="btn-salvar-perfil">Salvar Perfil</button>
            </form>
          </div>
        </div>`;
      document.body.appendChild(modalPerfil);
    }

    const preview = modalPerfil.querySelector("#perfil-avatar-preview");
    const form = modalPerfil.querySelector("#perfil-form");
    const inputNome = modalPerfil.querySelector("#perfil-nome");
    const perfilAviso = modalPerfil.querySelector("#perfil-aviso");
    const btnSalvar = modalPerfil.querySelector("#btn-salvar-perfil");
    const btnAleatorio = modalPerfil.querySelector("#btn-aleatorio-avatar");
    const btnFechar = modalPerfil.querySelector("#btn-fechar-perfil");

    const selects = [
      "avatar-skin", "avatar-hair", "avatar-hair-color",
      "avatar-eyes", "avatar-mouth", "avatar-accessory", "avatar-bg"
    ];

    let currentSeed = "kdl7urbo";

    function randomSeed() {
      return Math.random().toString(36).substring(2, 10);
    }

    function obterUrlDicebear() {
      const skin = modalPerfil.querySelector("#avatar-skin").value;
      const hair = modalPerfil.querySelector("#avatar-hair").value;
      const hairColor = modalPerfil.querySelector("#avatar-hair-color").value;
      const eyes = modalPerfil.querySelector("#avatar-eyes").value;
      const mouth = modalPerfil.querySelector("#avatar-mouth").value;
      const acc = modalPerfil.querySelector("#avatar-accessory").value;
      const bg = modalPerfil.querySelector("#avatar-bg").value;

      const params = new URLSearchParams();
      params.set("seed", currentSeed);
      params.set("backgroundColor", bg);
      if (skin) params.set("skinColor", skin);
      if (hair) params.set("hairVariant", hair);
      if (hairColor) params.set("hairColor", hairColor);
      if (eyes) params.set("eyesVariant", eyes);
      if (mouth) params.set("mouthVariant", mouth);
      if (acc) {
        params.set("accessoriesVariant", acc);
        params.set("accessoriesProbability", "100");
      } else {
        params.set("accessoriesProbability", "0");
      }
      return `https://api.dicebear.com/10.x/big-smile/svg?${params.toString()}`;
    }

    function atualizarPreview() {
      preview.src = obterUrlDicebear();
      atualizarShareCodeInput();
    }

    function atualizarShareCodeInput() {
      const shareInput = modalPerfil.querySelector("#avatar-share-code");
      if (!shareInput) return;
      const url = obterUrlDicebear();
      const query = url.split("?")[1] || "";
      shareInput.value = query;
    }

    selects.forEach(id => {
      modalPerfil.querySelector(`#${id}`).addEventListener("change", atualizarPreview);
    });

    btnAleatorio.addEventListener("click", () => {
      currentSeed = randomSeed();
      selects.forEach(id => {
        const select = modalPerfil.querySelector(`#${id}`);
        const idx = Math.floor(Math.random() * select.options.length);
        select.selectedIndex = idx;
      });
      atualizarPreview();
    });

    // Copiar código de compartilhamento
    const btnCopiarCode = modalPerfil.querySelector("#btn-copiar-share-code");
    if (btnCopiarCode) {
      btnCopiarCode.addEventListener("click", async () => {
        const shareInput = modalPerfil.querySelector("#avatar-share-code");
        if (!shareInput || !shareInput.value) return;
        try {
          await navigator.clipboard.writeText(shareInput.value);
          const original = btnCopiarCode.innerHTML;
          btnCopiarCode.innerHTML = '<i class="ph-fill ph-check" style="color: var(--pos);"></i>';
          setTimeout(() => {
            btnCopiarCode.innerHTML = original;
          }, 1200);
        } catch {}
      });
    }

    // Importar código colando diretamente no campo de texto
    const shareInput = modalPerfil.querySelector("#avatar-share-code");
    if (shareInput) {
      shareInput.addEventListener("input", () => {
        const code = shareInput.value.trim();
        if (!code) return;
        
        let queryString = code;
        if (queryString.includes("?")) {
          queryString = queryString.split("?")[1];
        }
        
        if (queryString.includes("seed") || queryString.includes("Variant") || queryString.includes("Color")) {
          try {
            restaurarConfigDeUrl(`https://api.dicebear.com/10.x/big-smile/svg?${queryString}`);
            atualizarPreview();
          } catch (err) {
            console.error("Erro ao processar código colado:", err);
          }
        }
      });

      // Facilita a cópia manual selecionando tudo ao focar
      shareInput.addEventListener("focus", () => shareInput.select());
    }

    function restaurarConfigDeUrl(url) {
      if (!url || !url.startsWith("http")) return;
      try {
        const parsed = new URL(url);
        const params = parsed.searchParams;

        if (params.has("seed")) currentSeed = params.get("seed");

        const setVal = (id, paramName) => {
          const val = params.get(paramName);
          const select = modalPerfil.querySelector(`#${id}`);
          if (val && select) select.value = val;
        };

        setVal("avatar-skin", "skinColor");
        setVal("avatar-hair", "hairVariant");
        setVal("avatar-hair-color", "hairColor");
        setVal("avatar-eyes", "eyesVariant");
        setVal("avatar-mouth", "mouthVariant");
        setVal("avatar-bg", "backgroundColor");

        const accSelect = modalPerfil.querySelector("#avatar-accessory");
        if (params.get("accessoriesProbability") === "0") {
          accSelect.value = "";
        } else if (params.has("accessoriesVariant")) {
          accSelect.value = params.get("accessoriesVariant");
        }
      } catch {}
    }

    function abrirModal() {
      perfilAviso.textContent = "";
      perfilAviso.classList.remove("erro");
      userDropdown.hidden = true;

      const cached = JSON.parse(localStorage.getItem(PERFIL_KEY) || "{}");
      inputNome.value = cached.nome !== "Você" ? (cached.nome || "") : "";

      if (cached.avatar_url) {
        restaurarConfigDeUrl(cached.avatar_url);
      } else {
        currentSeed = randomSeed();
      }

      atualizarPreview();
      modalPerfil.hidden = false;
      document.body.classList.add("modal-open");
    }

    const btnAbrirPerfil = document.querySelector("#btn-abrir-perfil");
    if (btnAbrirPerfil) {
      btnAbrirPerfil.addEventListener("click", abrirModal);
    }

    const avLgContainer = document.querySelector("#user-av-lg-container");
    if (avLgContainer) {
      avLgContainer.addEventListener("click", abrirModal);
    }

    btnFechar.addEventListener("click", () => {
      modalPerfil.hidden = true;
      document.body.classList.remove("modal-open");
    });
    modalPerfil.addEventListener("click", (e) => {
      if (e.target === modalPerfil) {
        modalPerfil.hidden = true;
        document.body.classList.remove("modal-open");
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      perfilAviso.textContent = "";
      perfilAviso.classList.remove("erro");

      const nomeDigitado = inputNome.value.trim();
      if (!nomeDigitado) {
        perfilAviso.textContent = "Por favor, preencha o seu nome.";
        perfilAviso.classList.add("erro");
        return;
      }

      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";

      try {
        const session = await requireAuth();
        const user = session?.user;
        if (!user) throw new Error("Sessão inválida ou expirada. Faça login novamente.");

        const dicebearUrl = obterUrlDicebear();

        // 1. Faz o download do SVG do DiceBear
        const response = await fetch(dicebearUrl);
        if (!response.ok) throw new Error("Erro ao gerar a imagem no servidor do Dicebear.");
        const svgTexto = await response.text();

        // 2. Codifica em Data-URI (carrega instantaneamente offline do banco)
        const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgTexto)}`;

        // 3. Atualiza no Supabase (salva a URL paramétrica no banco para podermos restaurar as opções depois, mas atualiza a UI e o cache com o Data-URI para não ter rede)
        const { error } = await supabase
          .from("usuarios")
          .update({ nome: nomeDigitado, avatar_url: dicebearUrl })
          .eq("id", user.id);

        if (error) throw error;

        // Recupera o username atual do cache para preservá-lo (pois não é editado neste formulário)
        const cached = JSON.parse(localStorage.getItem(PERFIL_KEY) || "{}");
        const currentUsername = cached.username || null;

        // Atualiza a UI imediatamente
        aplicarPerfil(nomeDigitado, currentUsername, dataUri);

        // Atualiza o localStorage com o avatar_url (Data-URI de cache para evitar rede) e a URL do DiceBear para comparação
        localStorage.setItem(
          PERFIL_KEY,
          JSON.stringify({ nome: nomeDigitado, username: currentUsername, avatar_url: dataUri, dicebear_url: dicebearUrl })
        );

        modalPerfil.hidden = true;
        document.body.classList.remove("modal-open");
      } catch (err) {
        console.error(err);
        perfilAviso.textContent = err.message || "Erro ao salvar alterações.";
        perfilAviso.classList.add("erro");
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Perfil";
      }
    });

    const copiar = document.querySelector("#user-copiar");
    if (copiar) {
      copiar.hidden = !activeUsername;
      copiar.addEventListener("click", async () => {
        if (!activeUsername) return;
        try {
          await navigator.clipboard.writeText(activeUsername);
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

  montarUsuario();
}
