import { supabase, COIN_SVG } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { montarHeader } from "./header.js";
import { tocarMoeda } from "./som.js";

let activeBeforeUnloadHandler = null;

const heroEl = document.querySelector("#campanha-hero");
const gridEl = document.querySelector("#desafios-grid");
const rankingEl = document.querySelector("#ranking-campanha");
const quizRoot = document.querySelector("#quiz-root");
const avisoEl = document.querySelector("#aviso");

const campanhaId = new URLSearchParams(location.search).get("id");

const session = await requireAuth();
if (session) {
  montarHeader("desafios");
  if (!campanhaId) {
    avisoEl.textContent = "Campanha não encontrada.";
    avisoEl.classList.add("erro");
  } else {
    carregar();
  }
}

let campanha = null;
let desafios = [];
let participacoes = [];

async function carregar() {
  // Busca campanha
  const { data: camp, error } = await supabase
    .from("campanhas_desafios")
    .select("*")
    .eq("id", campanhaId)
    .maybeSingle();

  if (error || !camp) {
    avisoEl.textContent = "Campanha não encontrada ou inativa.";
    avisoEl.classList.add("erro");
    return;
  }

  campanha = camp;

  
  document.documentElement.style.setProperty("--camp-cor", camp.cor_primaria || "#6366f1");
  document.documentElement.style.setProperty("--camp-cor2", camp.cor_secundaria || "#a78bfa");

  const { nomeLimpo: tituloLimpo } = obterIconeDeTexto(camp.nome);
  document.title = `${tituloLimpo} · CR Store`;

  const [desafiosRes, progressoRes, participacoesRes, rankingRes] = await Promise.all([
    supabase
      .from("desafios")
      .select("id, titulo, descricao, tipo, tempo_segundos, max_tentativas, xp_recompensa, pontos_recompensa, ordem, imagem_url")
      .eq("campanha_id", campanhaId)
      .eq("ativo", true)
      .order("ordem"),
    supabase.rpc("progresso_campanha", { p_campanha_id: campanhaId }),
    supabase
      .from("desafio_participacoes")
      .select("desafio_id, completado, acertos, total_perguntas, pontuacao, tentativa_num")
      .eq("campanha_id", campanhaId)
      .eq("completado", true),
    supabase.rpc("ranking_campanha", { p_campanha_id: campanhaId }),
  ]);

  desafios = desafiosRes.data || [];
  participacoes = participacoesRes.data || [];
  const progresso = progressoRes.data || { total_desafios: 0, completados: 0, xp_total: 0, pontos_total: 0 };

  renderHero(progresso);
  renderDesafios();
  renderRanking(rankingRes.data);
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

function renderizarBannerHtml(urlCompleta, classeCSS = "", altura = "100px") {
  if (!urlCompleta) return "";
  const { url, fit } = obterAjusteImagem(urlCompleta);
  
  if (fit === "contain-blur") {
    return `
      <div class="${classeCSS}-wrapper" style="position: relative; height: ${altura}; border-radius: 8px; margin-bottom: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--canvas);">
        <div style="position: absolute; inset: 0; background: url('${url}') no-repeat center/cover; filter: blur(15px) brightness(0.65); transform: scale(1.15);"></div>
        <div style="position: absolute; inset: 0; background: url('${url}') no-repeat center/contain;"></div>
      </div>`;
  } else if (fit === "contain") {
    return `
      <div class="${classeCSS}" style="background: var(--canvas) url('${url}') no-repeat center/contain; height: ${altura}; border-radius: 8px; margin-bottom: 12px; border: 1px solid var(--border);"></div>`;
  } else {
    return `
      <div class="${classeCSS}" style="background: url('${url}') no-repeat center/cover; height: ${altura}; border-radius: 8px; margin-bottom: 12px; border: 1px solid var(--border);"></div>`;
  }
}

function renderHero(prog) {
  const urlBannerCompleta = obterUrlImagem(campanha.banner_url);
  const { url: urlBanner, fit } = obterAjusteImagem(urlBannerCompleta);
  
  let heroStyle = "";
  let heroExtraHtml = "";
  
  if (urlBanner) {
    if (fit === "contain-blur") {
      heroStyle = `position: relative; overflow: hidden;`;
      heroExtraHtml = `
        <div style="position: absolute; inset: 0; background: url('${urlBanner}') no-repeat center/cover; filter: blur(20px) brightness(0.45); transform: scale(1.15); z-index: 0;"></div>
        <div style="position: absolute; inset: 0; background: url('${urlBanner}') no-repeat center/contain; z-index: 1; opacity: 0.85;"></div>
        <div style="position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.7)); z-index: 2;"></div>
      `;
    } else if (fit === "contain") {
      heroStyle = `position: relative; overflow: hidden; background: var(--canvas);`;
      heroExtraHtml = `
        <div style="position: absolute; inset: 0; background: url('${urlBanner}') no-repeat center/contain; z-index: 1; opacity: 0.85;"></div>
        <div style="position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)); z-index: 2;"></div>
      `;
    } else {
      heroStyle = `background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('${urlBanner}') no-repeat center/cover;`;
    }
  } else {
    heroStyle = `background: linear-gradient(135deg, ${campanha.cor_primaria}, ${campanha.cor_secundaria});`;
  }

  const { iconeClass, nomeLimpo } = obterIconeDeTexto(campanha.nome);

  heroEl.innerHTML = `
    <div class="campanha-hero" style="${heroStyle}">
      ${heroExtraHtml}
      <div style="position: relative; z-index: 3;">
        <h1><i class="ph-fill ${iconeClass}" style="margin-right: 10px; vertical-align: middle;"></i>${nomeLimpo}</h1>
        <p>${campanha.descricao || ""}</p>
        <div class="campanha-hero-stats">
          <div class="campanha-hero-stat">
            <span>Desafios</span>
            <strong>${prog.completados}/${prog.total_desafios}</strong>
          </div>
          <div class="campanha-hero-stat">
            <span>XP ganho</span>
            <strong>${prog.xp_total}</strong>
          </div>
          <div class="campanha-hero-stat">
            <span>CRcoins ganhos</span>
            <strong>${prog.pontos_total}</strong>
          </div>
        </div>
      </div>
      <div class="campanha-hero-accent"></div>
    </div>`;
}


function renderDesafios() {
  if (desafios.length === 0) {
    gridEl.innerHTML = `
      <div class="desafios-vazio">
        <i class="ph-fill ph-puzzle-piece"></i>
        <h2>Nenhum desafio disponível</h2>
        <p>Os desafios desta campanha ainda não foram publicados.</p>
      </div>`;
    return;
  }

  gridEl.innerHTML = desafios
    .map((d, i) => {
      const concluido = participacoes.some((p) => p.desafio_id === d.id);
      
      // Um desafio está bloqueado se o anterior na ordem (se houver) não estiver concluído
      let bloqueado = false;
      if (i > 0) {
        const anteriorConcluido = participacoes.some((p) => p.desafio_id === desafios[i - 1].id);
        bloqueado = !anteriorConcluido;
      }

      const icoMap = {
        quiz: { icon: "ph-exam", bg: "#ede9fe", color: "#6366f1" },
        verdadeiro_falso: { icon: "ph-check-square", bg: "#e8f5e9", color: "#4caf50" },
        multipla_escolha: { icon: "ph-list-checks", bg: "#fff4dc", color: "#b9820a" },
      };
      const ico = icoMap[d.tipo] || icoMap.quiz;

      const xpRecompensa = d.xp_recompensa > 0 ? d.xp_recompensa : campanha.xp_recompensa;
      const pontosRecompensa = d.pontos_recompensa > 0 ? d.pontos_recompensa : campanha.pontos_recompensa;

      const urlDesafioImg = obterUrlImagem(d.imagem_url);
      const bannerHtml = renderizarBannerHtml(urlDesafioImg, "desafio-card-banner", "100px");

      const overlayHtml = concluido
        ? `
        <div class="desafio-concluido-overlay">
          <div class="desafio-concluido-selo">
            <i class="ph-fill ph-circle-wavy-check"></i>
            <span>CONCLUÍDO</span>
          </div>
        </div>`
        : (bloqueado ? `
        <div class="desafio-bloqueado-overlay">
          <div class="desafio-bloqueado-selo">
            <i class="ph-fill ph-lock"></i>
            <span>BLOQUEADO</span>
          </div>
        </div>` : "");

      return `
        <div class="desafio-card ${concluido ? "concluido" : ""} ${bloqueado ? "bloqueado" : ""}" data-desafio="${d.id}" style="animation-delay: ${i * 0.06}s">
          ${overlayHtml}
          ${bannerHtml}
          <div class="desafio-card-top">
            <div class="desafio-ico" style="background: ${ico.bg}; color: ${ico.color};">
              <i class="ph-fill ${ico.icon}"></i>
            </div>
            <h3>${d.titulo}</h3>
          </div>
          <p>${d.descricao || ""}</p>
          <div class="desafio-card-meta">
            <span class="xp-tag"><i class="ph-fill ph-lightning"></i> ${xpRecompensa} XP</span>
            <span class="pts-tag">${COIN_SVG} ${pontosRecompensa}</span>
            ${d.tempo_segundos ? `<span><i class="ph-fill ph-timer"></i> ${d.tempo_segundos}s</span>` : ""}
            ${d.max_tentativas ? `<span><i class="ph-fill ph-arrows-clockwise"></i> ${d.max_tentativas}x</span>` : ""}
          </div>
        </div>`;
    })
    .join("");

  gridEl.querySelectorAll("[data-desafio]").forEach((el) =>
    el.addEventListener("click", () => {
      if (el.classList.contains("bloqueado")) return;
      iniciarQuiz(el.dataset.desafio);
    })
  );
}


function renderRanking(dados) {
  if (!dados || dados.length === 0) {
    rankingEl.innerHTML = '<li class="ranking-vazio">Seja o primeiro a completar um desafio!</li>';
    return;
  }

  rankingEl.innerHTML = dados
    .map((r) => {
      const posClass =
        r.posicao === 1 ? "ouro" : r.posicao === 2 ? "prata" : r.posicao === 3 ? "bronze" : "";
      const avHtml = r.avatar_url
        ? `<img class="ranking-av" src="${r.avatar_url}" alt="" />`
        : `<span class="ranking-av-inicial">${(r.nome || "?").trim().charAt(0).toUpperCase()}</span>`;
      return `
        <li class="ranking-item">
          <span class="ranking-pos ${posClass}">${r.posicao}</span>
          ${avHtml}
          <div class="ranking-info">
            <strong>${r.nome || "Usuário"}</strong>
            <span>${r.desafios_completos} desafio${r.desafios_completos !== 1 ? "s" : ""}</span>
          </div>
          <div class="ranking-stats-group">
            <span class="rank-stat-badge score" title="Pontos do Quiz"><i class="ph-fill ph-check-square"></i> ${Math.round(r.pontuacao || 0)} pts</span>
            <span class="rank-stat-badge xp" title="XP Ganho"><i class="ph-fill ph-lightning"></i> ${Math.round(r.xp || 0)} XP</span>
            <span class="rank-stat-badge crc" title="CRcoins Ganhos">${COIN_SVG} ${Math.round(r.crcoins || 0)}</span>
          </div>
        </li>`;
    })
    .join("");
}


const LETRAS = ["A", "B", "C", "D", "E", "F"];

function obterProximaPerguntaId(state, p, selecionadaAlt) {
  if (selecionadaAlt && selecionadaAlt.proxima_pergunta_id) {
    const existe = state.perguntas.some((q) => q.id === selecionadaAlt.proxima_pergunta_id);
    if (existe) return selecionadaAlt.proxima_pergunta_id;
  }
  const index = state.perguntas.findIndex((q) => q.id === p.id);
  if (index !== -1 && index + 1 < state.perguntas.length) {
    return state.perguntas[index + 1].id;
  }
  return null;
}

function mostrarConfirmacaoDesafio(desafio, onConfirm) {
  const modal = document.createElement("div");
  modal.className = "modal-bg";
  modal.style.zIndex = "99999";
  
  modal.innerHTML = `
    <div class="modal modal-anuncio-animated" style="max-width: 400px; --theme-color: #f97316; animation: modalEntrada 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;">
      <div class="modal-inner" style="text-align: center; padding: 28px 24px;">
        <div style="font-size: 40px; margin-bottom: 16px;">⏱️</div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--ink); margin: 0 0 12px 0;">Desafio com Tempo</h2>
        <p style="font-size: 13.5px; line-height: 1.6; color: var(--muted); margin: 0 0 24px 0;">
          Este desafio possui um tempo limite de <strong>${desafio.tempo_segundos} segundos</strong>.<br><br>
          Uma vez iniciado, o cronômetro <strong>não para</strong>, mesmo se você fechar a página, recarregar ou sair. Se o tempo acabar, a tentativa será concluída com 0 pontos.
        </p>
        <div style="display: flex; gap: 12px; width: 100%;">
          <button id="btn-confirmar-cancelar" style="flex: 1; padding: 12px; border-radius: 12px; background: var(--canvas); color: var(--muted); border: 1px solid var(--border); font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.2s;">
            Cancelar
          </button>
          <button id="btn-confirmar-iniciar" style="flex: 1; padding: 12px; border-radius: 12px; background: var(--theme-color); color: white; border: none; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.2s;">
            Iniciar
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  
  const fechar = () => {
    modal.remove();
    document.body.classList.remove("modal-open");
  };
  
  modal.querySelector("#btn-confirmar-cancelar").addEventListener("click", fechar);
  modal.querySelector("#btn-confirmar-iniciar").addEventListener("click", () => {
    fechar();
    onConfirm();
  });
}

async function iniciarQuiz(desafioId) {
  console.log("iniciarQuiz chamado para o desafio:", desafioId);
  try {
    const concluido = participacoes.some((p) => p.desafio_id === desafioId);
    console.log("desafio concluido?", concluido, "participacoes:", participacoes);
    if (concluido) {
      return;
    }

    // Verifica se o desafio anterior está concluído
    const idx = desafios.findIndex((d) => d.id === desafioId);
    console.log("indice do desafio na lista:", idx, "desafios carregados:", desafios);
    if (idx > 0) {
      const anteriorConcluido = participacoes.some((p) => p.desafio_id === desafios[idx - 1].id);
      console.log("desafio anterior concluido?", anteriorConcluido);
      if (!anteriorConcluido) {
        alert("Você precisa completar os desafios anteriores desta campanha primeiro!");
        return;
      }
    }

    const desafio = desafios.find((d) => d.id === desafioId);
    console.log("desafio encontrado:", desafio);
    if (!desafio) {
      console.warn("Desafio não encontrado na lista de desafios!");
      return;
    }

    if (desafio.tempo_segundos) {
      console.log("Desafio possui tempo limite de segundos. Abrindo confirmação customizada.");
      mostrarConfirmacaoDesafio(desafio, () => {
        executarIniciarQuiz(desafioId, desafio);
      });
      return;
    }

    // Se não tem tempo, inicia direto
    executarIniciarQuiz(desafioId, desafio);
  } catch (err) {
    console.error("Erro crítico não tratado em iniciarQuiz:", err);
    alert("Ocorreu um erro ao iniciar o quiz. Verifique o console do navegador.");
  }
}

async function executarIniciarQuiz(desafioId, desafio) {
  try {
    console.log("Chamando RPC iniciar_participacao_desafio no Supabase...");
    // Inicia a participação no banco de dados para travar o timer e as tentativas
    const { data: initData, error: initError } = await supabase.rpc("iniciar_participacao_desafio", {
      p_desafio_id: desafioId
    });

    if (initError) {
      console.error("Erro retornado pelo RPC iniciar_participacao_desafio:", initError);
      alert("Erro ao iniciar desafio: " + initError.message);
      return;
    }

    console.log("Resultado do RPC iniciar_participacao_desafio:", initData);

    if (initData.status === "expirado") {
      alert("Tempo esgotado! Você saiu do desafio ou o tempo limite expirou. Esta tentativa foi finalizada com 0 pontos.");
      location.reload();
      return;
    }

    console.log("Buscando perguntas do desafio...");
    const { data: perguntas, error: perguntasError } = await supabase
      .from("desafio_perguntas")
      .select("id, texto, imagem_url, ordem")
      .eq("desafio_id", desafioId)
      .order("ordem");

    if (perguntasError) {
      console.error("Erro ao buscar perguntas:", perguntasError);
      alert("Erro ao buscar perguntas: " + perguntasError.message);
      return;
    }

    console.log("Perguntas carregadas:", perguntas);

    if (!perguntas || perguntas.length === 0) {
      alert("Este desafio não possui perguntas configuradas.");
      return;
    }

    const perguntaIds = perguntas.map((p) => p.id);
    console.log("Buscando alternativas para as perguntas:", perguntaIds);
    const { data: alternativas, error: alternativasError } = await supabase
      .from("desafio_alternativas_seguras")
      .select("id, pergunta_id, texto, ordem, proxima_pergunta_id")
      .in("pergunta_id", perguntaIds)
      .order("ordem");

    if (alternativasError) {
      console.error("Erro ao buscar alternativas:", alternativasError);
      alert("Erro ao buscar alternativas: " + alternativasError.message);
      return;
    }

    console.log("Alternativas carregadas:", alternativas);

    const altsPorPergunta = {};
    for (const a of alternativas || []) {
      if (!altsPorPergunta[a.pergunta_id]) altsPorPergunta[a.pergunta_id] = [];
      altsPorPergunta[a.pergunta_id].push(a);
    }

    const state = {
      desafio,
      perguntas,
      altsPorPergunta,
      historico: [perguntas[0].id], 
      respostas: {}, 
      respostasVerificadas: {}, 
      verificando: false, 
      inicio: Date.now(),
      timerInterval: null,
      tempoRestante: initData.tempo_restante !== undefined ? initData.tempo_restante : (desafio.tempo_segundos || null),
    };

    if (state.tempoRestante !== null) {
      activeBeforeUnloadHandler = (e) => {
        e.preventDefault();
        e.returnValue = "O tempo do desafio continuará correndo no servidor. Se você sair ou recarregar a página, poderá falhar por tempo esgotado. Tem certeza?";
        return e.returnValue;
      };
      window.addEventListener("beforeunload", activeBeforeUnloadHandler);
    }

    quizRoot.innerHTML = `
      <div class="quiz-overlay" id="quiz-overlay">
        <div class="quiz-container" id="quiz-container-inner">
      
        </div>
      </div>`;

    quizRoot.querySelector("#quiz-overlay").addEventListener("click", (e) => {
      if (e.target.id === "quiz-overlay") fecharQuiz(state);
    });

    console.log("Renderizando conteúdo do quiz no modal...");
    renderQuizOverlayContent(state);
  } catch (err) {
    console.error("Erro crítico em executarIniciarQuiz:", err);
    alert("Ocorreu um erro ao carregar o desafio. Verifique o console.");
  }
}

function renderQuizOverlayContent(state) {
  const container = quizRoot.querySelector("#quiz-container-inner");
  if (!container) return;

  const { desafio, perguntas, historico } = state;
  const pId = historico[historico.length - 1];
  const p = perguntas.find((q) => q.id === pId) || perguntas[0];
  const alts = state.altsPorPergunta[p.id] || [];
  
  const verif = state.respostasVerificadas[p.id] || null;
  const selecionada = state.respostas[p.id] || null;
  const proximaId = obterProximaPerguntaId(state, p, verif ? alts.find((a) => a.id === selecionada) : null);
  const ehUltima = (proximaId === null);

  const passo = historico.length;
  const progressPct = Math.min((passo / perguntas.length) * 100, 100);


  const altsHtml = alts
    .map((a, i) => {
      let feedbackClass = "";
      if (verif) {
        if (a.id === verif.corretaId) {
          feedbackClass = "certa"; 
        } else if (a.id === selecionada && !verif.correta) {
          feedbackClass = "errada"; 
        }
      } else if (selecionada === a.id) {
        feedbackClass = "selecionada";
      }

    
      const stylePointer = (verif || state.verificando) ? "style='pointer-events: none; opacity: 0.85;'" : "";

      return `
        <li class="quiz-alt ${feedbackClass}" data-alt="${a.id}" data-pergunta="${p.id}" ${stylePointer}>
          <span class="alt-letra">${LETRAS[i] || i + 1}</span>
          <span>${a.texto}</span>
        </li>`;
    })
    .join("");

  container.innerHTML = `
    <div class="quiz-header">
      <h3>${desafio.titulo}</h3>
      <button class="quiz-close" id="quiz-fechar">✕</button>
    </div>

    <div class="quiz-progress">
      <div class="quiz-progress-bar">
        <div class="quiz-progress-fill" style="width: ${progressPct}%;"></div>
      </div>
      <span class="quiz-progress-text">Pergunta ${passo}/${perguntas.length}</span>
    </div>

    ${state.tempoRestante !== null ? `
      <div class="quiz-timer" id="quiz-timer">
        <i class="ph-fill ph-timer"></i>
        <span id="timer-valor">${formatarTempo(state.tempoRestante)}</span>
      </div>
    ` : ""}

    <div class="quiz-body">
      <div class="quiz-pergunta">${p.texto}</div>
      ${p.imagem_url ? `<img src="${p.imagem_url}" alt="" style="max-width: 100%; border-radius: 12px; margin-bottom: 16px;" />` : ""}
      <ul class="quiz-alternativas">
        ${altsHtml}
      </ul>
    </div>

    <div class="quiz-footer">
      <button class="quiz-btn-next" id="quiz-proximo" ${(!verif || state.verificando) ? "disabled" : ""}>
        ${state.verificando ? "Verificando..." : ehUltima ? "Enviar Respostas" : "Próxima"}
      </button>
    </div>`;


  container.querySelector("#quiz-fechar").addEventListener("click", () => fecharQuiz(state));


  if (!verif && !state.verificando) {
    container.querySelectorAll(".quiz-alt").forEach((el) =>
      el.addEventListener("click", () => verificarResposta(state, el.dataset.pergunta, el.dataset.alt))
    );
  }

  const btnProximo = container.querySelector("#quiz-proximo");
  if (btnProximo) {
    btnProximo.addEventListener("click", () => {
      if (ehUltima) {
        submeterQuiz(state);
      } else {
        state.historico.push(proximaId);
        renderQuizOverlayContent(state);
      }
    });
  }



  if (state.tempoRestante !== null && !state.timerInterval) {
    state.timerInterval = setInterval(() => {
      state.tempoRestante--;
      const timerEl = container.querySelector("#timer-valor");
      const timerContainer = container.querySelector("#quiz-timer");
      if (timerEl) {
        timerEl.textContent = formatarTempo(state.tempoRestante);
      }
      if (timerContainer && state.tempoRestante <= 10) {
        timerContainer.classList.add("urgente");
      }
      if (state.tempoRestante <= 0) {
        clearInterval(state.timerInterval);
        submeterQuiz(state);
      }
    }, 1000);
  }
}

async function verificarResposta(state, perguntaId, alternativaId) {
  if (state.verificando) return;
  state.verificando = true;
  state.respostas[perguntaId] = alternativaId;
  

  renderQuizOverlayContent(state);

  try {

    const { data, error } = await supabase.rpc("verificar_resposta_pergunta", {
      p_pergunta_id: perguntaId,
      p_alternativa_id: alternativaId
    });

    if (!error && data) {
      state.respostasVerificadas[perguntaId] = {
        correta: data.correta,
        corretaId: data.correta_id
      };
      
      if (data.correta) {
        try { tocarMoeda(); } catch {}
      }
    } else {
      state.respostasVerificadas[perguntaId] = {
        correta: true,
        corretaId: alternativaId
      };
    }
  } catch (err) {
    console.error("Erro ao verificar resposta:", err);
    state.respostasVerificadas[perguntaId] = {
      correta: true,
      corretaId: alternativaId
    };
  }

  state.verificando = false;
  renderQuizOverlayContent(state);
}

function mostrarConfirmacaoFecharQuiz(state, onConfirm) {
  const modal = document.createElement("div");
  modal.className = "modal-bg";
  modal.style.zIndex = "999999"; // Fica acima do quiz overlay
  
  modal.innerHTML = `
    <div class="modal modal-anuncio-animated" style="max-width: 400px; --theme-color: #ef4444; animation: modalEntrada 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;">
      <div class="modal-inner" style="text-align: center; padding: 28px 24px;">
        <div style="font-size: 40px; margin-bottom: 16px;">⚠️</div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--ink); margin: 0 0 12px 0;">Sair do Desafio?</h2>
        <p style="font-size: 13.5px; line-height: 1.6; color: var(--muted); margin: 0 0 24px 0;">
          O cronômetro <strong>continuará correndo no servidor</strong>!<br><br>
          Se você fechar o jogo agora, poderá perder o tempo restante e falhar por tempo esgotado na sua tentativa atual.
        </p>
        <div style="display: flex; gap: 12px; width: 100%;">
          <button id="btn-confirmar-fechar-cancelar" style="flex: 1; padding: 12px; border-radius: 12px; background: var(--canvas); color: var(--muted); border: 1px solid var(--border); font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.2s;">
            Voltar ao Jogo
          </button>
          <button id="btn-confirmar-fechar-sair" style="flex: 1; padding: 12px; border-radius: 12px; background: var(--theme-color); color: white; border: none; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.2s;">
            Sair
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const fechar = () => {
    modal.remove();
  };
  
  modal.querySelector("#btn-confirmar-fechar-cancelar").addEventListener("click", fechar);
  modal.querySelector("#btn-confirmar-fechar-sair").addEventListener("click", () => {
    fechar();
    onConfirm();
  });
}

function fecharQuiz(state) {
  if (state.tempoRestante !== null) {
    mostrarConfirmacaoFecharQuiz(state, () => {
      realizarFecharQuiz(state);
    });
    return;
  }
  realizarFecharQuiz(state);
}

function realizarFecharQuiz(state) {
  if (activeBeforeUnloadHandler) {
    window.removeEventListener("beforeunload", activeBeforeUnloadHandler);
    activeBeforeUnloadHandler = null;
  }

  if (state.timerInterval) clearInterval(state.timerInterval);
  quizRoot.innerHTML = "";
}

function formatarTempo(s) {
  if (s <= 0) return "0:00";
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

async function submeterQuiz(state) {
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  if (activeBeforeUnloadHandler) {
    window.removeEventListener("beforeunload", activeBeforeUnloadHandler);
    activeBeforeUnloadHandler = null;
  }
  
  const container = quizRoot.querySelector("#quiz-container-inner");
  if (!container) return;

  const tempoGasto = Math.round((Date.now() - state.inicio) / 1000);


  const respostas = state.historico.map((pId) => ({
    pergunta_id: pId,
    alternativa_id: state.respostas[pId] || null,
  })).filter((r) => r.alternativa_id);

  container.innerHTML = `
    <div class="quiz-resultado">
      <div class="quiz-resultado-emoji">⏳</div>
      <h2>Calculando resultado...</h2>
    </div>`;

  const { data, error } = await supabase.rpc("responder_desafio", {
    p_desafio_id: state.desafio.id,
    p_respostas: respostas,
    p_tempo_gasto: tempoGasto,
  });

  if (error) {
    container.innerHTML = `
      <div class="quiz-resultado">
        <div class="quiz-resultado-emoji">❌</div>
        <h2>Erro</h2>
        <span class="sub">${error.message}</span>
        <div class="quiz-resultado-btns" style="margin-top: 20px;">
          <button class="quiz-btn-next" id="quiz-fechar-erro">Fechar</button>
        </div>
      </div>`;
    container.querySelector("#quiz-fechar-erro").addEventListener("click", () => {
      quizRoot.innerHTML = "";
    });
    return;
  }


  renderResultado(state, data);
}

function renderResultado(state, result) {
  const container = quizRoot.querySelector("#quiz-container-inner");
  if (!container) return;

  const pct = result.total > 0 ? Math.round((result.acertos / result.total) * 100) : 0;
  const emoji = pct === 100 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "👍" : "💪";
  const titulo = pct === 100 ? "Perfeito!" : pct >= 70 ? "Muito bem!" : pct >= 50 ? "Bom trabalho!" : "Continue tentando!";

  if (pct >= 70) {
    dispararConfetti();
    try { tocarMoeda(); } catch {}
  }

  container.innerHTML = `
    <div class="quiz-resultado">
      <div class="quiz-resultado-emoji">${emoji}</div>
      <h2>${titulo}</h2>
      <span class="sub">${result.ja_completou_antes ? "Você já completou este desafio antes. Sem recompensas extras." : `Tentativa #${result.tentativa}`}</span>

      <div class="quiz-resultado-stats">
        <div class="quiz-resultado-stat">
          <strong>${result.acertos}/${result.total}</strong>
          <span>Acertos</span>
        </div>
        <div class="quiz-resultado-stat">
          <strong>${pct}%</strong>
          <span>Aproveitamento</span>
        </div>
        <div class="quiz-resultado-stat">
          <strong>${result.pontuacao}</strong>
          <span>Pontuação</span>
        </div>
      </div>

      ${(result.xp_ganho > 0 || result.pontos_ganhos > 0) ? `
        <div class="quiz-resultado-recompensas">
          ${result.xp_ganho > 0 ? `<span class="recompensa-tag xp"><i class="ph-fill ph-lightning"></i> +${result.xp_ganho} XP</span>` : ""}
          ${result.pontos_ganhos > 0 ? `<span class="recompensa-tag coins">${COIN_SVG} +${result.pontos_ganhos}</span>` : ""}
        </div>
      ` : ""}

      <div class="quiz-resultado-btns">
        <button class="quiz-btn-secondary" id="quiz-fechar-resultado">Fechar</button>
      </div>
    </div>`;

  container.querySelector("#quiz-fechar-resultado").addEventListener("click", () => {
    quizRoot.innerHTML = "";
    carregar(); 
  });
}

function dispararConfetti() {
  const cores = ["#f7c600", "#6366f1", "#4caf50", "#ef4444", "#ec4899", "#f97316", "#22d3ee"];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement("div");
    el.className = "confetti-particle";
    el.style.left = `${Math.random() * 100}vw`;
    el.style.background = cores[Math.floor(Math.random() * cores.length)];
    el.style.animationDelay = `${Math.random() * 0.8}s`;
    el.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;
    el.style.width = `${6 + Math.random() * 6}px`;
    el.style.height = `${6 + Math.random() * 6}px`;
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }
}
