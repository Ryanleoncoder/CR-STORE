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
const destAvatar = document.querySelector("#dest-avatar");
const transfAviso = document.querySelector("#transf-aviso");

const session = await requireAuth();
let destinatario = null;
let buscaTimer;

if (session) {
  montarHeader("carteira");
  carregarSaldo();
  carregarResumo();
  carregarExtrato();
}

async function carregarSaldo() {
  const { data } = await supabase.from("carteiras").select("saldo").single();
  saldoEl.textContent = data?.saldo ?? 0;
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
      <div class="skeleton-text">
        <div class="skeleton skeleton-line1" style="width: 45%; height: 14px;"></div>
        <div class="skeleton skeleton-line2" style="width: 65%; height: 10px; margin-top: 6px;"></div>
      </div>
      <div class="skeleton" style="width: 60px; height: 20px;"></div>
    </li>
  `).join("");

  const { data } = await supabase
    .from("transacoes_carteira")
    .select("id, tipo, valor, descricao, criado_em")
    .order("criado_em", { ascending: false })
    .limit(6);

  if (!data || data.length === 0) {
    extratoEl.innerHTML = "<li class='vazio'>Nenhuma movimentação ainda.</li>";
    return;
  }

  extratoEl.innerHTML =
    data
      .map((t) => {
        const s = sinalDe(t);
        return `
      <li>
        <div>
          <strong>${rotulo(t.tipo)}</strong>
          <span>${t.descricao ?? "—"} · ${formatarData(t.criado_em)}</span>
        </div>
        <b class="${s.cls}">${s.txt}${s.abs}</b>
      </li>`;
      })
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

  if (!data || data.length === 0) {
    resultados.innerHTML =
      termo === ""
        ? "<li class='vazio'>Nenhum contato disponível ainda.</li>"
        : "<li class='vazio'>Nenhum usuário encontrado.</li>";
    return;
  }

  resultados.innerHTML = data
    .map((u) => {
      const nome = u.nome || (u.username ? "@" + u.username : "Usuário");
      const sub = u.username ? "@" + u.username : "";
      const inicial = (u.nome || u.username || "?").trim().charAt(0).toUpperCase();
      return `
      <li data-id="${u.id}" data-nome="${nome.replace(/"/g, "&quot;")}">
        <span class="resultado-av">${inicial}</span>
        <span class="resultado-info">
          <strong>${nome}</strong>
          <span>${sub}</span>
        </span>
      </li>`;
    })
    .join("");

  resultados.querySelectorAll("li[data-id]").forEach((li) =>
    li.addEventListener("click", () => selecionar(li.dataset.id, li.dataset.nome))
  );
}

busca.addEventListener("input", () => {
  clearTimeout(buscaTimer);
  const termo = busca.value.trim().replace(/^@/, "");
  buscaTimer = setTimeout(() => carregarUsuariosBusca(termo), 200);
});

function irPasso(quem) {
  passoQuem.hidden = !quem;
  passoValor.hidden = quem;
  transfTitulo.textContent = quem ? "Para quem transferir?" : "Valor da transferência";
}

function resetTransfer() {
  destinatario = null;
  transfForm.reset();
  busca.value = "";
  transfAviso.textContent = "";
  transfAviso.classList.remove("erro");
  irPasso(true);
}

function selecionar(id, nome) {
  destinatario = id;
  destinatarioNome.textContent = nome;
  destAvatar.textContent = (nome || "?").trim().charAt(0).toUpperCase();
  irPasso(false);
  setTimeout(() => document.querySelector("#valor").focus(), 50);
}

document.querySelector("#trocar").addEventListener("click", () => {
  transfAviso.textContent = "";
  transfAviso.classList.remove("erro");
  irPasso(true);
  carregarUsuariosBusca("");
});

transfForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  transfAviso.textContent = "";
  transfAviso.classList.remove("erro");

  const valor = parseInt(document.querySelector("#valor").value, 10);
  const mensagem = document.querySelector("#mensagem").value.trim() || null;

  const btn = document.querySelector("#btn-confirmar-transf");
  btn.disabled = true;

  const { error } = await supabase.rpc("transferir_pontos", {
    p_destinatario_id: destinatario,
    p_valor: valor,
    p_mensagem: mensagem,
  });

  btn.disabled = false;

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
      .select("id, tipo, valor, descricao, criado_em")
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

  extratoDetalhadoLista.innerHTML = filtrado
    .map((t) => {
      const s = sinalDe(t);
      return `
      <li style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border);">
        <div>
          <strong style="display: block; font-size: 14px; font-weight: 600;">${rotulo(t.tipo)}</strong>
          <span style="font-size: 12px; color: var(--muted);">${t.descricao ?? "—"} · ${formatarData(t.criado_em)}</span>
        </div>
        <b class="${s.cls}" style="font-size: 14px;">${s.txt}${s.abs}</b>
      </li>`;
    })
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
