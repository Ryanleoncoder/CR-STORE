import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { montarHeader } from "./header.js";

const campanhasLista = document.querySelector("#campanhas-lista");

let perfilUsuario = null;
const session = await requireAuth();

if (session) {
  montarHeader("desafios");
  carregar();
}

async function carregarRankingPorPeriodo(periodo, currentUserId) {
  mostrarSkeletonsRanking();
  
 
  let { data, error } = await supabase.rpc("ranking_xp_periodo", { p_periodo: periodo });
  

  if (error) {
    console.warn("Função ranking_xp_periodo não encontrada ou falhou. Usando fallback...", error);
    const fallbackRes = await supabase.rpc("ranking_geral_xp");
    data = fallbackRes.data;
  }
  
  renderRankingGeral(data, currentUserId, periodo);
}

async function carregar() {
  mostrarSkeletonsCampanhas();
  mostrarSkeletonsRanking();


  const { data: campanhas } = await supabase
    .from("campanhas_desafios")
    .select("id, nome, descricao, cor_primaria, cor_secundaria, inicio, fim, ativo, banner_url")
    .eq("ativo", true)
    .order("criado_em", { ascending: false });

  renderCampanhas(campanhas);
  
  const currentUserId = session?.user?.id;

 
  if (currentUserId) {
    try {
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nome, username, avatar_url")
        .eq("id", currentUserId)
        .single();
      if (perfil) {
        perfilUsuario = perfil;
      }
    } catch (err) {
      console.error("Erro ao carregar perfil do usuário para o ranking:", err);
    }
  }
  

  await carregarRankingPorPeriodo("monthly", currentUserId);


  document.querySelectorAll(".leaderboard-tabs-pill .tab-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.classList.contains("active")) return; 
      
      document.querySelectorAll(".leaderboard-tabs-pill .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const tab = btn.dataset.tab; 
      await carregarRankingPorPeriodo(tab, currentUserId);
    });
  });

 
  document.querySelectorAll(".mobile-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mobile-toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const layout = document.querySelector(".desafios-layout");
      if (layout) {
        if (btn.dataset.target === "ranking") {
          layout.classList.remove("show-campanhas");
          layout.classList.add("show-ranking");
        } else {
          layout.classList.remove("show-ranking");
          layout.classList.add("show-campanhas");
        }
      }
    });
  });
}

const MAPA_EMOJIS = {
  "🎓": "ph-graduation-cap",
  "🏆": "ph-trophy",
  "🎯": "ph-target",
  "⭐": "ph-star",
  "🔥": "ph-fire",
  "⚡": "ph-lightning",
  "🎮": "ph-game-controller",
  "💡": "ph-lightbulb",
  "💰": "ph-coins",
  "👑": "ph-crown",
  "🎁": "ph-gift",
  "📅": "ph-calendar",
  "⏰": "ph-clock",
  "🚀": "ph-rocket"
};

function obterIconeDeTexto(nome) {
  if (!nome) return { emoji: null, iconeClass: "ph-target", nomeLimpo: "" };
  const match = nome.match(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA9F}]/u
  );
  const emoji = match ? match[0] : null;
  const iconeClass = emoji ? (MAPA_EMOJIS[emoji] || "ph-target") : "ph-target";
  
  let nomeLimpo = nome;
  if (emoji) {
    nomeLimpo = nome.replace(emoji, "").trim();
  }
  
  return { emoji, iconeClass, nomeLimpo };
}

function obterUrlImagem(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("produtos").getPublicUrl(path);
  return data?.publicUrl || "";
}

function obterAjusteImagem(url) {
  if (!url) return { url: "", fit: "cover" };
  const parts = url.split("#fit=");
  return {
    url: parts[0],
    fit: parts[1] || "cover"
  };
}

async function renderCampanhas(campanhas) {
  if (!campanhas || campanhas.length === 0) {
    campanhasLista.innerHTML = `
      <div class="desafios-vazio">
        <i class="ph-fill ph-flag-banner"></i>
        <h2>Nenhuma campanha ativa</h2>
        <p>Quando uma nova campanha for publicada, ela aparecerá aqui.</p>
      </div>`;
    return;
  }


  const progressos = await Promise.all(
    campanhas.map((c) => supabase.rpc("progresso_campanha", { p_campanha_id: c.id }))
  );

  campanhasLista.innerHTML = campanhas
    .map((c, i) => {
      const prog = progressos[i]?.data || { total_desafios: 0, completados: 0 };
      const percent =
        prog.total_desafios > 0
          ? Math.round((prog.completados / prog.total_desafios) * 100)
          : 0;
      const tempoBadge = badgeTempo(c.fim);
      const { iconeClass, nomeLimpo } = obterIconeDeTexto(c.nome);
      const urlBannerCompleta = obterUrlImagem(c.banner_url);
      const { url: urlBanner, fit } = obterAjusteImagem(urlBannerCompleta);

      let bannerStyle = "";
      let bannerExtraHtml = "";
      
      if (urlBanner) {
        if (fit === "contain-blur") {
          bannerStyle = `position: relative; overflow: hidden;`;
          bannerExtraHtml = `
            <div style="position: absolute; inset: 0; background: url('${urlBanner}') no-repeat center/cover; filter: blur(15px) brightness(0.75); transform: scale(1.15);"></div>
            <div style="position: absolute; inset: 0; background: url('${urlBanner}') no-repeat center/contain;"></div>
            <div style="position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.35));"></div>
          `;
        } else if (fit === "contain") {
          bannerStyle = `position: relative; overflow: hidden; background: var(--canvas);`;
          bannerExtraHtml = `
            <div style="position: absolute; inset: 0; background: url('${urlBanner}') no-repeat center/contain;"></div>
            <div style="position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.3));"></div>
          `;
        } else {
          bannerStyle = `background: linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.35)), url('${urlBanner}') no-repeat center/cover;`;
        }
      } else {
        bannerStyle = `background: linear-gradient(135deg, ${c.cor_primaria}, ${c.cor_secundaria});`;
      }

      const bannerContent = urlBanner 
        ? bannerExtraHtml 
        : `<div class="camp-icon-fallback"><i class="ph-fill ${iconeClass}"></i></div>`;

      return `
        <article class="campanha-card" data-id="${c.id}" style="animation-delay: ${i * 0.08}s">
          <div class="campanha-card-banner" style="${bannerStyle}">
            ${bannerContent}
          </div>
          <div class="campanha-card-body">
            <h3><i class="ph-fill ${iconeClass} titulo-icone" style="color: ${c.cor_primaria};"></i> ${nomeLimpo}</h3>
            <p>${c.descricao || ""}</p>
            <div class="campanha-card-footer">
              <div class="progress-bar-wrapper">
                <div class="progress-bar">
                  <div class="progress-bar-fill" style="width: ${percent}%; background: ${c.cor_primaria};"></div>
                </div>
                <span class="progress-label">${prog.completados}/${prog.total_desafios}</span>
              </div>
              ${tempoBadge}
            </div>
          </div>
        </article>`;
    })
    .join("");

    
  campanhasLista.querySelectorAll("[data-id]").forEach((el) =>
    el.addEventListener("click", () => {
      window.location.href = `/campanha?id=${el.dataset.id}`;
    })
  );
}

function badgeTempo(fim) {
  if (!fim) return '<span class="campanha-tempo-badge">Permanente</span>';
  const ms = new Date(fim) - new Date();
  if (ms <= 0) return '<span class="campanha-tempo-badge encerrado">Encerrada</span>';
  const dias = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (dias <= 3) return `<span class="campanha-tempo-badge urgente">${dias}d restantes</span>`;
  return `<span class="campanha-tempo-badge">${dias}d restantes</span>`;
}



function renderRankingGeral(dados, currentUserId, periodo) {
  const podiumContainer = document.querySelector("#leaderboard-podium-container");
  const tableBody = document.querySelector("#ranking-geral-table-body");

  const safeDados = dados || [];

  if (podiumContainer) {
    const top3 = safeDados.slice(0, 3);
    const p1 = top3[0] || null;
    const p2 = top3[1] || null;
    const p3 = top3[2] || null;

    const getAvatarHtml = (p, rank) => {
      if (!p) return `<div class="podium-avatar-empty">-</div>`;
      const nameLetter = (p.nome || p.username || "?").trim().charAt(0).toUpperCase();
      const av = p.avatar_url
        ? `<img class="podium-av" src="${p.avatar_url}" alt="${p.nome}" />`
        : `<span class="podium-av-inicial">${nameLetter}</span>`;
      
      const crown = rank === 1 ? `<div class="podium-crown"><i class="ph-fill ph-crown"></i></div>` : '';
      const isYouClass = p.usuario_id === currentUserId ? 'is-you' : '';
      
      return `
        <div class="podium-avatar-wrapper rank-${rank} ${isYouClass}">
          ${crown}
          ${av}
          <div class="podium-badge-xp">${p.xp} XP</div>
        </div>
      `;
    };

    const getNameHtml = (p) => {
      if (!p) return `<span class="podium-name empty">Sem dados</span>`;
      const isYou = p.usuario_id === currentUserId ? ' <span class="you-badge">Você</span>' : '';
      const dispName = p.nome || p.username || "Usuário";
      return `<span class="podium-name" title="${dispName}">${dispName}${isYou}</span>`;
    };

    podiumContainer.innerHTML = `
      <!-- Segundo Lugar (Esquerda) -->
      <div class="podium-column-wrapper">
        ${getAvatarHtml(p2, 2)}
        ${getNameHtml(p2)}
        <div class="podium-column silver">
          <span class="podium-num">2</span>
        </div>
      </div>

      <!-- Primeiro Lugar (Centro) -->
      <div class="podium-column-wrapper gold-wrapper">
        ${getAvatarHtml(p1, 1)}
        ${getNameHtml(p1)}
        <div class="podium-column gold">
          <span class="podium-num">1</span>
        </div>
      </div>

      <!-- Terceiro Lugar (Direita) -->
      <div class="podium-column-wrapper">
        ${getAvatarHtml(p3, 3)}
        ${getNameHtml(p3)}
        <div class="podium-column bronze">
          <span class="podium-num">3</span>
        </div>
      </div>
    `;
  }


  if (tableBody) {
    const rest = safeDados.slice(3);
    if (rest.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="ranking-vazio">Nenhum outro jogador no ranking.</td>
        </tr>`;
    } else {
      const leaderXp = safeDados[0]?.xp || 1;
      
      tableBody.innerHTML = rest
        .map((r) => {
          const isYou = r.usuario_id === currentUserId;
          const youClass = isYou ? "is-you" : "";
          const nameLetter = (r.nome || r.username || "?").trim().charAt(0).toUpperCase();
          const avHtml = r.avatar_url
            ? `<img class="ranking-av premium-av" src="${r.avatar_url}" alt="" />`
            : `<span class="ranking-av-inicial premium-av-inicial">${nameLetter}</span>`;
          
          const youBadge = isYou ? `<span class="you-badge">Você</span>` : "";
          const percent = leaderXp > 0 ? Math.min(100, Math.max(0, Math.round((r.xp / leaderXp) * 100))) : 0;

          return `
            <tr class="ranking-item premium-row ${youClass}">
              <td class="leaderboard-table-rank">
                ${r.posicao}º
              </td>
              <td>
                <div class="leaderboard-table-player">
                  ${avHtml}
                  <div class="leaderboard-table-player-info">
                    <strong>${r.nome || "Usuário"}${youBadge}</strong>
                    <span>${r.username ? "@" + r.username : ""}</span>
                  </div>
                </div>
              </td>
              <td class="leaderboard-table-xp">${r.xp} XP</td>
              <td class="leaderboard-table-progress">
                <div class="table-progress-bar-wrapper">
                  <div class="table-progress-bar">
                    <div class="table-progress-bar-fill" style="width: ${percent}%;"></div>
                  </div>
                  <span class="table-progress-percent">${percent}%</span>
                </div>
              </td>
            </tr>`;
        })
        .join("");
    }
  }


  renderSeuDesempenho(perfilUsuario, safeDados, periodo, currentUserId);
}

function renderSeuDesempenho(perfil, dados, periodo, currentUserId) {
  const container = document.querySelector("#seu-desempenho-container");
  if (!container) return;

  if (!currentUserId) {
    container.innerHTML = `
      <div class="seu-desempenho-card">
        <span class="seu-desempenho-header-tag">Seu Desempenho</span>
        <div class="seu-desempenho-tip">
          Faça login para acompanhar seu progresso e competir no ranking!
        </div>
      </div>`;
    return;
  }


  const userRankData = dados ? dados.find(r => r.usuario_id === currentUserId) : null;
  const rank = userRankData ? userRankData.posicao : null;
  const xp = userRankData ? userRankData.xp : 0;
  
  const nomeVal = perfil?.nome || "Você";
  const usernameVal = perfil?.username ? `@${perfil.username}` : "";
  const nameLetter = nomeVal.trim().charAt(0).toUpperCase();
  const avHtml = perfil?.avatar_url
    ? `<img class="seu-desempenho-av" src="${perfil.avatar_url}" alt="Seu Avatar" />`
    : `<span class="seu-desempenho-av-inicial">${nameLetter}</span>`;


  let periodoTxt = "este mês";
  if (periodo === "today") periodoTxt = "hoje";
  else if (periodo === "weekly") periodoTxt = "esta semana";
  else if (periodo === "all-time") periodoTxt = "no geral";

  const leader = dados && dados.length > 0 ? dados[0] : null;
  const leaderXp = leader ? leader.xp : 0;
  const leaderNome = leader ? (leader.usuario_id === currentUserId ? "você" : (leader.nome || leader.username || "o líder")) : "o líder";

  let progressoHtml = "";
  let tipHtml = "";

  if (leader && leader.usuario_id === currentUserId) {
    tipHtml = `<i class="ph-fill ph-crown" style="color: #f7c600; font-size: 14px; margin-right: 4px; vertical-align: middle;"></i> Excelente trabalho! Você é o <b>líder do ranking</b> ${periodoTxt}! Continue pontuando para manter a coroa.`;
    progressoHtml = `
      <div class="seu-desempenho-progress-wrapper">
        <div class="seu-desempenho-progress-bar">
          <div class="seu-desempenho-progress-fill" style="width: 100%;"></div>
        </div>
        <div class="seu-desempenho-progress-labels">
          <span>Você está no topo!</span>
          <span>100%</span>
        </div>
      </div>`;
  } else if (leader && leaderXp > 0) {
    const xpDiferenca = leaderXp - xp;
    const percent = Math.min(100, Math.max(0, Math.round((xp / leaderXp) * 100)));
    tipHtml = `<i class="ph-fill ph-trend-up" style="color: #f7c600; font-size: 14px; margin-right: 4px; vertical-align: middle;"></i> Faltam <b>${xpDiferenca} XP</b> para você alcançar <b>${leaderNome}</b> no topo ${periodoTxt}!`;
    progressoHtml = `
      <div class="seu-desempenho-progress-wrapper">
        <div class="seu-desempenho-progress-bar">
          <div class="seu-desempenho-progress-fill" style="width: ${percent}%;"></div>
        </div>
        <div class="seu-desempenho-progress-labels">
          <span>Progresso até o líder</span>
          <span>${percent}%</span>
        </div>
      </div>`;
  } else {
    tipHtml = `<i class="ph-fill ph-sparkles" style="color: #f7c600; font-size: 14px; margin-right: 4px; vertical-align: middle;"></i> Complete desafios e ganhe XP para começar a subir no ranking ${periodoTxt}!`;
    progressoHtml = `
      <div class="seu-desempenho-progress-wrapper">
        <div class="seu-desempenho-progress-bar">
          <div class="seu-desempenho-progress-fill" style="width: 0%;"></div>
        </div>
        <div class="seu-desempenho-progress-labels">
          <span>Sem pontuação</span>
          <span>0%</span>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="seu-desempenho-card">
      <span class="seu-desempenho-header-tag">Seu Desempenho</span>
      
      <div class="seu-desempenho-profile">
        ${avHtml}
        <div class="seu-desempenho-name-group">
          <span class="seu-desempenho-nome">${nomeVal}</span>
          <span class="seu-desempenho-handle">${usernameVal}</span>
        </div>
      </div>

      <div class="seu-desempenho-stats-grid">
        <div class="seu-desempenho-stat-box">
          <span class="seu-desempenho-stat-label">Sua Posição</span>
          <span class="seu-desempenho-stat-value rank-val">${rank ? `${rank}º` : "—"}</span>
        </div>
        <div class="seu-desempenho-stat-box">
          <span class="seu-desempenho-stat-label">Seu XP</span>
          <span class="seu-desempenho-stat-value xp-val">${xp} XP</span>
        </div>
      </div>

      <div class="seu-desempenho-footer">
        <div class="seu-desempenho-tip">${tipHtml}</div>
        ${progressoHtml}
      </div>
    </div>`;
}

// --- Skeletons ---

function mostrarSkeletonsCampanhas() {
  campanhasLista.innerHTML = Array(3)
    .fill(0)
    .map(
      () => `
      <div class="campanha-card" style="pointer-events: none;">
        <div class="campanha-card-banner" style="background: var(--soft);"></div>
        <div class="campanha-card-body">
          <div class="skeleton" style="width: 60%; height: 18px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="width: 90%; height: 12px; margin-bottom: 16px;"></div>
          <div class="skeleton" style="width: 100%; height: 6px; border-radius: 99px;"></div>
        </div>
      </div>`
    )
    .join("");
}

function mostrarSkeletonsRanking() {
  const podiumContainer = document.querySelector("#leaderboard-podium-container");
  const tableBody = document.querySelector("#ranking-geral-table-body");
  const performanceContainer = document.querySelector("#seu-desempenho-container");

  if (podiumContainer) {
    podiumContainer.innerHTML = `
      <div class="podium-column-wrapper" style="opacity: 0.6; pointer-events: none;">
        <div class="skeleton" style="width: 52px; height: 52px; border-radius: 50%; margin-bottom: 8px;"></div>
        <div class="skeleton" style="width: 45px; height: 10px; margin-bottom: 6px;"></div>
        <div class="podium-column silver" style="height: 50px;"></div>
      </div>
      <div class="podium-column-wrapper gold-wrapper" style="opacity: 0.6; pointer-events: none;">
        <div class="skeleton" style="width: 64px; height: 64px; border-radius: 50%; margin-bottom: 8px;"></div>
        <div class="skeleton" style="width: 55px; height: 12px; margin-bottom: 6px;"></div>
        <div class="podium-column gold" style="height: 75px;"></div>
      </div>
      <div class="podium-column-wrapper" style="opacity: 0.6; pointer-events: none;">
        <div class="skeleton" style="width: 52px; height: 52px; border-radius: 50%; margin-bottom: 8px;"></div>
        <div class="skeleton" style="width: 45px; height: 10px; margin-bottom: 6px;"></div>
        <div class="podium-column bronze" style="height: 38px;"></div>
      </div>
    `;
  }

  if (tableBody) {
    tableBody.innerHTML = Array(7)
      .fill(0)
      .map(
        () => `
        <tr style="pointer-events: none; opacity: 0.7;">
          <td><div class="skeleton" style="width: 24px; height: 16px; border-radius: 4px;"></div></td>
          <td>
            <div class="leaderboard-table-player">
              <div class="skeleton" style="width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;"></div>
              <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
                <div class="skeleton" style="width: 100px; height: 12px; border-radius: 4px;"></div>
                <div class="skeleton" style="width: 60px; height: 8px; border-radius: 4px;"></div>
              </div>
            </div>
          </td>
          <td style="text-align: right;"><div class="skeleton" style="width: 50px; height: 16px; border-radius: 12px; margin-left: auto;"></div></td>
          <td class="leaderboard-table-progress">
            <div class="table-progress-bar-wrapper">
              <div class="table-progress-bar">
                <div class="table-progress-bar-fill" style="width: 0%;"></div>
              </div>
              <div class="skeleton" style="width: 30px; height: 10px; border-radius: 4px; flex-shrink: 0;"></div>
            </div>
          </td>
        </tr>`
      )
      .join("");
  }

  if (performanceContainer) {
    performanceContainer.innerHTML = `
      <div class="seu-desempenho-card" style="pointer-events: none; opacity: 0.7;">
        <span class="seu-desempenho-header-tag">Seu Desempenho</span>
        <div class="seu-desempenho-profile">
          <div class="skeleton" style="width: 60px; height: 60px; border-radius: 50%;"></div>
          <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
            <div class="skeleton" style="width: 120px; height: 16px; border-radius: 4px;"></div>
            <div class="skeleton" style="width: 80px; height: 12px; border-radius: 4px;"></div>
          </div>
        </div>
        <div class="seu-desempenho-stats-grid">
          <div class="seu-desempenho-stat-box">
            <span class="seu-desempenho-stat-label">Sua Posição</span>
            <div class="skeleton" style="width: 40px; height: 24px; border-radius: 4px; margin-top: 4px;"></div>
          </div>
          <div class="seu-desempenho-stat-box">
            <span class="seu-desempenho-stat-label">Seu XP</span>
            <div class="skeleton" style="width: 60px; height: 24px; border-radius: 4px; margin-top: 4px;"></div>
          </div>
        </div>
        <div class="seu-desempenho-footer">
          <div class="skeleton" style="width: 90%; height: 14px; border-radius: 4px;"></div>
          <div class="seu-desempenho-progress-wrapper" style="margin-top: 8px;">
            <div class="seu-desempenho-progress-bar"></div>
          </div>
        </div>
      </div>`;
  }
}
