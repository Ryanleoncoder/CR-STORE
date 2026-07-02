import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { montarHeader } from "./header.js";
import { tocarMoeda } from "./som.js";

const saldoEl = document.querySelector("#saldo");
const extratoEl = document.querySelector("#extrato");

const busca = document.querySelector("#busca");
const resultados = document.querySelector("#resultados");
const passoQuem = document.querySelector("#transf-passo-quem");
const passoValor = document.querySelector("#transf-passo-valor");
const transfForm = document.querySelector("#transf-form");
const transfTitulo = document.querySelector("#transf-titulo");
const destinatarioNome = document.querySelector("#destinatario-nome");
const destAvatarContainer = document.querySelector("#dest-avatar-container");
const transfAviso = document.querySelector("#transf-aviso");

const valorInput = document.querySelector("#valor");
if (valorInput) {
  valorInput.addEventListener("input", () => {
    valorInput.value = valorInput.value.replace(/\D/g, "");
    atualizarBotaoValor();
  });
}

function mostrarErroTransf(msg) {
  transfAviso.textContent = msg;
  transfAviso.classList.add("erro");
}

const session = await requireAuth();
let destinatario = null;
let destContato = null;
let buscaTimer;
let saldoAtual = 0;

if (session) {
  montarHeader("carteira");
  carregarSaldo();
  carregarResumo();
  carregarExtrato();
  renderRecentesCarteira();
}

async function carregarSaldo() {
  const { data } = await supabase.from("carteiras").select("saldo").single();
  saldoAtual = data?.saldo ?? 0;
  saldoEl.textContent = saldoAtual;
}

async function carregarResumo() {
  const { data } = await supabase
    .from("transacoes_carteira")
    .select("saldo_anterior, saldo_posterior")
    .limit(2000);

  let ganho = 0;
  let gasto = 0;
  (data ?? []).forEach((t) => {
    const delta = t.saldo_posterior - t.saldo_anterior;
    if (delta > 0) ganho += delta;
    else gasto += -delta;
  });

  document.querySelector("#total-ganho").innerHTML = `${ganho} <small>CRC</small>`;
  document.querySelector("#total-gasto").innerHTML = `${gasto} <small>CRC</small>`;
}

async function carregarExtrato() {
  extratoEl.innerHTML = Array(4).fill(0).map(() => `
    <li class="skeleton-row" style="border: none; padding: 12px 0;">
      <div class="skeleton" style="width: 40px; height: 40px; border-radius: 50%; flex: 0 0 40px;"></div>
      <div class="skeleton-text">
        <div class="skeleton skeleton-line1" style="width: 45%; height: 14px;"></div>
        <div class="skeleton skeleton-line2" style="width: 65%; height: 10px; margin-top: 6px;"></div>
      </div>
      <div class="skeleton" style="width: 60px; height: 20px;"></div>
    </li>
  `).join("");

  const { data } = await supabase
    .from("transacoes_carteira")
    .select("id, tipo, valor, descricao, criado_em, referencia_id")
    .order("criado_em", { ascending: false })
    .limit(6);

  if (!data || data.length === 0) {
    extratoEl.innerHTML = "<li class='vazio'>Nenhuma movimentação ainda.</li>";
    return;
  }

  const contras = await mapaContrapartes(data);
  extratoEl.innerHTML =
    data
      .map((t) => linhaExtrato(t, contras[t.referencia_id]))
      .join("") +
    `<li class="extrato-vertudo"><button type="button" id="btn-ver-tudo" class="link">Ver extrato completo →</button></li>`;

  document
    .querySelector("#btn-ver-tudo")
    ?.addEventListener("click", () => document.querySelector("#btn-scroll-extrato").click());
}

function formatarData(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function rotulo(tipo) {
  const mapa = {
    credito: "Crédito",
    debito: "Débito",
    transferencia_enviada: "Transferência enviada",
    transferencia_recebida: "Transferência recebida",
    compra_loja: "Compra na loja",
    resgate_codigo: "Resgate de código",
    ajuste_admin: "Ajuste",
  };
  return mapa[tipo] ?? tipo;
}

const saidas = ["debito", "transferencia_enviada", "compra_loja"];
// Ajuste do admin pode ser + ou - (valor com sinal); o resto é positivo.
function ehSaida(t) {
  if (t.tipo === "ajuste_admin") return t.valor < 0;
  return saidas.includes(t.tipo);
}
function sinalDe(t) {
  const saida = ehSaida(t);
  return { cls: saida ? "saida" : "entrada", txt: saida ? "−" : "+", abs: Math.abs(t.valor) };
}

function iconeDe(tipo) {
  const mapa = {
    transferencia_enviada: { icon: "ph-paper-plane-tilt", bg: "#ede7f6", color: "#673ab7" },
    transferencia_recebida: { icon: "ph-user", bg: "#e8f5e9", color: "var(--pos)" },
    compra_loja: { icon: "ph-shopping-cart", bg: "#fde3cf", color: "#d96b27" },
    credito: { icon: "ph-plus", bg: "#e8f5e9", color: "var(--pos)" },
    debito: { icon: "ph-minus", bg: "#fdecea", color: "var(--neg)" },
    resgate_codigo: { icon: "ph-ticket", bg: "#fff4dc", color: "#b9820a" },
    ajuste_admin: { icon: "ph-sliders-horizontal", bg: "#ede7f6", color: "#673ab7" },
  };
  return mapa[tipo] ?? { icon: "ph-circle", bg: "#eee", color: "var(--muted)" };
}


async function mapaContrapartes(txs) {
  const papelPorRef = {};
  for (const t of txs) {
    if (
      (t.tipo === "transferencia_enviada" || t.tipo === "transferencia_recebida") &&
      t.referencia_id
    ) {
      papelPorRef[t.referencia_id] = t.tipo;
    }
  }
  const refs = Object.keys(papelPorRef);
  if (refs.length === 0) return {};

  const { data: transfs } = await supabase
    .from("transferencias_pontos")
    .select("id, remetente_id, destinatario_id")
    .in("id", refs);
  if (!transfs || transfs.length === 0) return {};

  const contraPorRef = {};
  const userIds = new Set();
  for (const tr of transfs) {
    const uid =
      papelPorRef[tr.id] === "transferencia_enviada" ? tr.destinatario_id : tr.remetente_id;
    if (uid) {
      contraPorRef[tr.id] = uid;
      userIds.add(uid);
    }
  }
  if (userIds.size === 0) return {};

  const { data: users } = await supabase
    .from("usuarios")
    .select("id, nome, avatar_url")
    .in("id", [...userIds]);
  const userPorId = {};
  for (const u of users || []) userPorId[u.id] = u;

  const out = {};
  for (const [ref, uid] of Object.entries(contraPorRef)) {
    if (userPorId[uid]) out[ref] = userPorId[uid];
  }
  return out;
}

function linhaExtrato(t, contra) {
  const s = sinalDe(t);
  let icoHtml;
  let sub = `${t.descricao ?? "—"} · ${formatarData(t.criado_em)}`;

  if (contra) {
    const nome = contra.nome || "Usuário";
    const preposicao = t.tipo === "transferencia_recebida" ? "de" : "para";
    sub = `${preposicao} ${nome} · ${formatarData(t.criado_em)}`;
    icoHtml = contra.avatar_url
      ? `<span class="extrato-ico"><img src="${contra.avatar_url}" alt="${nome}" /></span>`
      : `<span class="extrato-ico extrato-ico-inicial">${nome.trim().charAt(0).toUpperCase()}</span>`;
  } else {
    const ic = iconeDe(t.tipo);
    icoHtml = `<span class="extrato-ico" style="background:${ic.bg}; color:${ic.color};"><i class="ph-fill ${ic.icon}"></i></span>`;
  }

  return `
      <li>
        ${icoHtml}
        <div class="extrato-info">
          <strong>${rotulo(t.tipo)}</strong>
          <span>${sub}</span>
        </div>
        <b class="${s.cls}">${s.txt}${s.abs}</b>
      </li>`;
}

const transfHint = document.querySelector(".transf-hint");

function inicialDe(u) {
  return (u.nome || u.username || "?").trim().charAt(0).toUpperCase();
}

function wireCliques() {
  resultados.querySelectorAll("li[data-id]").forEach((li) =>
    li.addEventListener("click", () =>
      selecionar(li.dataset.id, li.dataset.nome, li.dataset.username, li.dataset.avatarUrl)
    )
  );
}

async function renderRecentesCarteira() {
  const bloco = document.querySelector("#recentes-bloco");
  const row = document.querySelector("#recentes-carteira");
  if (!bloco || !row) return;

  const { data: recentes } = await supabase.rpc("contatos_recentes");
  if (!recentes || recentes.length === 0) {
    bloco.hidden = true;
    return;
  }

  bloco.hidden = false;
  row.innerHTML = recentes
    .map((u) => {
      const nome = u.nome || (u.username ? "@" + u.username : "Usuário");
      const avHtml = u.avatar_url 
        ? `<img class="resultado-av" src="${u.avatar_url}" alt="Avatar" />`
        : `<span class="resultado-av">${inicialDe(u)}</span>`;
      return `
      <li class="recente-card" data-id="${u.id}" data-nome="${nome.replace(/"/g, "&quot;")}" data-username="${u.username || ""}" data-avatar-url="${u.avatar_url || ""}">
        ${avHtml}
        <span class="recente-nome">${nome}</span>
      </li>`;
    })
    .join("");

  row.querySelectorAll("li[data-id]").forEach((li) =>
    li.addEventListener("click", () =>
      abrirTransferenciaCom(li.dataset.id, li.dataset.nome, li.dataset.username, li.dataset.avatarUrl)
    )
  );
}

function abrirTransferenciaCom(id, nome, username, avatar_url) {
  resetTransfer();
  modalTransf.hidden = false;
  carregarUsuariosBusca("");
  selecionar(id, nome, username, avatar_url); 
}

function renderResultados(itens) {
  if (!itens || itens.length === 0) {
    resultados.innerHTML = "<li class='vazio'>Nenhum usuário encontrado.</li>";
    return;
  }

  resultados.innerHTML = itens
    .map((u) => {
      const nome = u.nome || (u.username ? "@" + u.username : "Usuário");
      const sub = u.username ? "@" + u.username : "";
      const sel = u.id === destinatario ? " selecionado" : "";
      const avHtml = u.avatar_url 
        ? `<img class="resultado-av" src="${u.avatar_url}" alt="Avatar" />`
        : `<span class="resultado-av">${inicialDe(u)}</span>`;
      return `
      <li class="resultado-item${sel}" data-id="${u.id}" data-nome="${nome.replace(/"/g, "&quot;")}" data-username="${u.username || ""}" data-avatar-url="${u.avatar_url || ""}">
        ${avHtml}
        <span class="resultado-info">
          <strong>${nome}</strong>
          <span>${sub}</span>
        </span>
        <span class="resultado-check"><i class="ph-fill ph-check-circle"></i></span>
      </li>`;
    })
    .join("");
  wireCliques();
}

async function carregarUsuariosBusca(termo = "") {
  resultados.innerHTML = Array(4).fill(0).map(() => `
    <li class="skeleton-row" style="border: none; padding: 10px 0;">
      <div class="skeleton-text">
        <div class="skeleton skeleton-line1" style="width: 40%; height: 12px;"></div>
        <div class="skeleton skeleton-line2" style="width: 60%; height: 8px; margin-top: 4px;"></div>
      </div>
    </li>
  `).join("");

  const { data } = await supabase.rpc("buscar_usuarios", { p_termo: termo });
  const filtrados = (data || []).filter((u) => u.id !== session?.user?.id);
  renderResultados(filtrados);
}

busca.addEventListener("input", () => {
  clearTimeout(buscaTimer);
  const termo = busca.value.trim().replace(/^@/, "");
  buscaTimer = setTimeout(() => carregarUsuariosBusca(termo), 200);
});

const transfConfig = document.querySelector("#transf-config");
const transfVazio = document.querySelector("#transf-vazio");
const modalTransfEl = document.querySelector(".modal-transf");
const STEP = 10;

document.querySelector("#transf-voltar")?.addEventListener("click", () => {
  modalTransfEl.classList.remove("mostrando-config");
});

function clampValor(v) {
  v = parseInt(v, 10);
  if (isNaN(v) || v < 1) v = 1;
  if (saldoAtual > 0 && v > saldoAtual) v = saldoAtual;
  return v;
}

function atualizarBotaoValor() {
  const btn = document.querySelector("#btn-confirmar-transf");
  if (!btn) return;
  const v = parseInt(valorInput.value, 10) || 0;
  btn.innerHTML = `<i class="ph-fill ph-paper-plane-tilt"></i> Transferir ${v} CRC`;
}

function resetTransfer() {
  destinatario = null;
  destContato = null;
  transfForm.reset();
  busca.value = "";
  transfAviso.textContent = "";
  transfAviso.classList.remove("erro");
  transfConfig.hidden = true;
  transfVazio.hidden = false;
  modalTransfEl.classList.remove("mostrando-config");
  resultados.querySelectorAll(".resultado-item").forEach((li) => li.classList.remove("selecionado"));
}

function selecionar(id, nome, username, avatar_url) {
  destinatario = id;
  destContato = { id, nome, username: username || null, avatar_url: avatar_url || null };
  destinatarioNome.textContent = nome;
  
  if (destAvatarContainer) {
    if (avatar_url) {
      destAvatarContainer.innerHTML = `<img class="transf-dest-av lg" id="dest-avatar" src="${avatar_url}" alt="Avatar" />`;
    } else {
      const inicial = (nome || "?").trim().charAt(0).toUpperCase();
      destAvatarContainer.innerHTML = `<span class="transf-dest-av lg" id="dest-avatar">${inicial}</span>`;
    }
  }

  document.querySelector("#dest-username").textContent = username ? "@" + username : "";
  document.querySelector("#transf-saldo-disp").textContent = saldoAtual + " CRC";
  transfVazio.hidden = true;
  transfConfig.hidden = false;
  modalTransfEl.classList.add("mostrando-config");

  resultados.querySelectorAll(".resultado-item").forEach((li) =>
    li.classList.toggle("selecionado", li.dataset.id === id)
  );

  if (!valorInput.value || parseInt(valorInput.value, 10) < 1) valorInput.value = "100";
  atualizarBotaoValor();
  setTimeout(() => valorInput.focus(), 50);
}

document.querySelector("#valor-menos").addEventListener("click", () => {
  valorInput.value = clampValor((parseInt(valorInput.value, 10) || 0) - STEP);
  atualizarBotaoValor();
});
document.querySelector("#valor-mais").addEventListener("click", () => {
  valorInput.value = clampValor((parseInt(valorInput.value, 10) || 0) + STEP);
  atualizarBotaoValor();
});

transfForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  transfAviso.textContent = "";
  transfAviso.classList.remove("erro");

  const valor = parseInt(valorInput.value, 10);
  const mensagem = document.querySelector("#mensagem").value.trim() || null;

  if (!destinatario) return mostrarErroTransf("Selecione um colaborador.");
  if (!valor || valor < 1) return mostrarErroTransf("Informe um valor válido.");
  if (valor > saldoAtual) return mostrarErroTransf("Saldo insuficiente.");

  const btn = document.querySelector("#btn-confirmar-transf");
  const btnTexto = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Transferindo…";

  const { error } = await supabase.rpc("transferir_pontos", {
    p_destinatario_id: destinatario,
    p_valor: valor,
    p_mensagem: mensagem,
  });

  btn.disabled = false;
  btn.innerHTML = btnTexto;

  if (error) {
    transfAviso.textContent = error.message;
    transfAviso.classList.add("erro");
    return;
  }

  tocarMoeda();
  modalTransf.hidden = true;
  resetTransfer();
  carregarSaldo();
  carregarResumo();
  carregarExtrato();
  renderRecentesCarteira();
});

const modalTransf = document.querySelector("#modal-transferir");
const btnTransferir = document.querySelector("#btn-transferir");
const btnFecharModal = document.querySelector("#btn-fechar-modal");

const modalAjuda = document.querySelector("#modal-ajuda");
const btnAjuda = document.querySelector("#btn-ajuda");
const btnFecharAjuda = document.querySelector("#btn-fechar-ajuda");

const btnScrollExtrato = document.querySelector("#btn-scroll-extrato");

if (btnTransferir) {
  btnTransferir.addEventListener("click", () => {
    resetTransfer();
    modalTransf.hidden = false;
    carregarUsuariosBusca("");
    busca.focus();
  });
}

if (btnFecharModal) {
  btnFecharModal.addEventListener("click", () => {
    modalTransf.hidden = true;
    resetTransfer();
  });
}

if (btnAjuda) {
  btnAjuda.addEventListener("click", () => {
    modalAjuda.hidden = false;
  });
}

if (btnFecharAjuda) {
  btnFecharAjuda.addEventListener("click", () => {
    modalAjuda.hidden = true;
  });
}

document.querySelectorAll(".modal-bg").forEach((bg) => {
  bg.addEventListener("click", (e) => {
    if (e.target === bg) {
      bg.hidden = true;
      if (bg === modalTransf) {
        resetTransfer();
      }
    }
  });
});

const modalExtrato = document.querySelector("#modal-extrato");
const btnFecharExtrato = document.querySelector("#btn-fechar-extrato");
const extratoDetalhadoLista = document.querySelector("#extrato-detalhado-lista");

let extratoCompleto = [];

async function carregarExtratoDetalhado(filtro = "todos") {
  extratoDetalhadoLista.innerHTML = Array(5).fill(0).map(() => `
    <li class="skeleton-row" style="border: none; padding: 12px 0;">
      <div class="skeleton" style="width: 40px; height: 40px; border-radius: 50%; flex: 0 0 40px;"></div>
      <div class="skeleton-text">
        <div class="skeleton skeleton-line1" style="width: 45%; height: 14px;"></div>
        <div class="skeleton skeleton-line2" style="width: 65%; height: 10px; margin-top: 6px;"></div>
      </div>
      <div class="skeleton" style="width: 60px; height: 20px;"></div>
    </li>
  `).join("");

  if (extratoCompleto.length === 0) {
    const { data } = await supabase
      .from("transacoes_carteira")
      .select("id, tipo, valor, descricao, criado_em, referencia_id")
      .order("criado_em", { ascending: false })
      .limit(100);
    extratoCompleto = data || [];
  }

  let filtrado = extratoCompleto;
  if (filtro === "entradas") {
    filtrado = extratoCompleto.filter((t) => !ehSaida(t));
  } else if (filtro === "saidas") {
    filtrado = extratoCompleto.filter((t) => ehSaida(t));
  }

  if (filtrado.length === 0) {
    extratoDetalhadoLista.innerHTML = "<li class='vazio'>Nenhuma movimentação encontrada.</li>";
    return;
  }

  const contras = await mapaContrapartes(filtrado);
  extratoDetalhadoLista.innerHTML = filtrado
    .map((t) => linhaExtrato(t, contras[t.referencia_id]))
    .join("");
}

if (btnScrollExtrato) {
  btnScrollExtrato.addEventListener("click", () => {
    modalExtrato.hidden = false;
    extratoCompleto = [];
    carregarExtratoDetalhado("todos");
    document.querySelectorAll(".extrato-filtros .btn-filtro").forEach((btn) => {
      btn.classList.toggle("ativo", btn.dataset.filtro === "todos");
    });
  });
}

if (btnFecharExtrato) {
  btnFecharExtrato.addEventListener("click", () => {
    modalExtrato.hidden = true;
  });
}

document.querySelectorAll(".extrato-filtros .btn-filtro").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".extrato-filtros .btn-filtro").forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    carregarExtratoDetalhado(btn.dataset.filtro);
  });
});

const modalResgatar = document.querySelector("#modal-resgatar");
const resgatarForm = document.querySelector("#resgatar-form");
const resgatarCodigo = document.querySelector("#resgatar-codigo");
const resgatarAviso = document.querySelector("#resgatar-aviso");

function abrirResgatar(codigo = "") {
  resgatarAviso.textContent = "";
  resgatarAviso.classList.remove("erro");
  resgatarCodigo.value = codigo;
  modalResgatar.hidden = false;
  resgatarCodigo.focus();
}

document.querySelector("#btn-resgatar").addEventListener("click", () => abrirResgatar());
document
  .querySelector("#btn-fechar-resgatar")
  .addEventListener("click", () => (modalResgatar.hidden = true));

resgatarForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  resgatarAviso.textContent = "";
  resgatarAviso.classList.remove("erro");

  const codigo = resgatarCodigo.value.trim();
  if (!codigo) return;

  const { data, error } = await supabase.rpc("resgatar_codigo", { p_codigo: codigo });
  if (error) {
    resgatarAviso.textContent = error.message;
    resgatarAviso.classList.add("erro");
    return;
  }

  resgatarForm.reset();
  resgatarAviso.textContent = `✓ +${data} CRcoins resgatados!`;
  carregarSaldo();
  carregarResumo();
  carregarExtrato();
  setTimeout(() => (modalResgatar.hidden = true), 1600);
});

// Link compartilhável: /carteira?codigo=XXXX
const codigoUrl = new URLSearchParams(location.search).get("codigo");
if (codigoUrl) abrirResgatar(codigoUrl.toUpperCase());
