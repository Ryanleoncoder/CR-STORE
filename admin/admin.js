import { supabase } from "../js/supabase.js";
import { requireAuth, logout } from "../js/auth.js";
import { getAccessToken } from "../js/auth-token.js";
import { urlImagem, uploadImagem } from "../js/storage.js";

const restrito = document.querySelector("#restrito");
const painel = document.querySelector("#painel");
const listaEl = document.querySelector("#usuarios");
const listaAviso = document.querySelector("#lista-aviso");
const wlForm = document.querySelector("#form-whitelist");
const wlAviso = document.querySelector("#wl-aviso");

document.querySelector("#sair").addEventListener("click", logout);

document.querySelectorAll(".sidebar-nav [data-sec]").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-nav [data-sec]").forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    document.querySelectorAll(".sec[data-sec]").forEach((s) => (s.hidden = s.dataset.sec !== btn.dataset.sec));
    if (btn.dataset.sec === "pedidos") {
      carregarPedidos();
    }
    if (btn.dataset.sec === "acessos") {
      carregarPendentes();
    }
  })
);

const session = await requireAuth();
if (session) iniciar();

async function authHeaders() {
  const token = await getAccessToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token ?? ""}`,
  };
}

async function iniciar() {
  const { data: userCargos, error: errCargos } = await supabase
    .from("usuario_cargos")
    .select("cargos!inner(codigo)");

  if (errCargos) {
    console.error(errCargos);
    restrito.hidden = false;
    return;
  }

  const roles = (userCargos ?? []).map(uc => uc.cargos?.codigo);
  const temPermissao = roles.some(r => ["admin", "estoque", "campanhas"].includes(r));

  if (!temPermissao) {
    restrito.hidden = false;
    return;
  }

  painel.hidden = false;

  const btnUsuarios = document.querySelector('.sidebar-nav [data-sec="usuarios"]');
  const btnAcessos = document.querySelector('.sidebar-nav [data-sec="acessos"]');
  const isAdmin = roles.includes("admin");
  const isEstoque = roles.includes("estoque");

  let defaultSec = "produtos";

  if (isAdmin) {
    defaultSec = "usuarios";
  } else {
    if (btnUsuarios) btnUsuarios.style.display = "none";
    if (btnAcessos) btnAcessos.style.display = "none";
    if (isEstoque) {
      defaultSec = "produtos";
    }
  }

  document.querySelectorAll(".sidebar-nav [data-sec]").forEach((btn) => {
    btn.classList.toggle("ativo", btn.dataset.sec === defaultSec);
  });
  document.querySelectorAll(".sec[data-sec]").forEach((s) => {
    s.hidden = s.dataset.sec !== defaultSec;
  });

  if (isAdmin) {
    carregar();
  }
  
  if (isAdmin || isEstoque) {
    carregarProdutos();
    if (defaultSec === "pedidos") {
      carregarPedidos();
    }
  }
}

async function carregar() {
  listaEl.innerHTML = Array(5).fill(0).map(() => `
    <li class="skeleton-row" style="border: none; padding: 14px 0;">
      <div class="skeleton-text">
        <div class="skeleton skeleton-line1" style="width: 40%; height: 14px;"></div>
        <div class="skeleton skeleton-line2" style="width: 60%; height: 10px; margin-top: 6px;"></div>
      </div>
      <div class="skeleton" style="width: 140px; height: 32px; border-radius: var(--r-pill);"></div>
    </li>
  `).join("");

  try {
    const res = await fetch("/api/usuarios", { headers: await authHeaders() });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Erro ao carregar usuários.");
    }
    usuariosTodos = await res.json();
    renderUsuarios(usuariosTodos);
  } catch (err) {
    console.error(err);
    listaEl.innerHTML = `<li class="vazio" style="color: var(--neg, #ef4444); font-weight: 600;">${err.message || "Erro de conexão ao carregar usuários."}</li>`;
  }
}

function saldoDe(u) {
  const c = u.carteiras;
  if (Array.isArray(c)) return c[0]?.saldo ?? 0;
  return c?.saldo ?? 0;
}

let usuariosTodos = [];
const CARGOS = [
  { codigo: "cliente", nome: "Cliente" },
  { codigo: "estoque", nome: "Estoque" },
  { codigo: "campanhas", nome: "Campanhas" },
  { codigo: "admin", nome: "Admin" },
];

function renderUsuarios(usuarios) {
  if (!usuarios || usuarios.length === 0) {
    listaEl.innerHTML = "<li class='vazio'>Nenhum usuário encontrado.</li>";
    return;
  }

  listaEl.innerHTML = usuarios
    .map((u) => {
      const cargoAtual =
        (u.usuario_cargos ?? []).map((uc) => uc.cargos?.codigo).filter(Boolean)[0] ||
        "cliente";
      const comprasCount = (u.pedidos ?? []).filter(
        (p) => p.status === "confirmado" || p.status === "entregue"
      ).length;
      const ehEu = u.id === session.user.id;
      const options = CARGOS.map(
        (c) =>
          `<option value="${c.codigo}" ${c.codigo === cargoAtual ? "selected" : ""}>${c.nome}</option>`
      ).join("");
      const actionButton = u.ativo
        ? (!ehEu ? `<button class="link btn-desativar" data-id="${u.id}">desativar</button>` : "")
        : `<button class="link btn-ativar" data-id="${u.id}" style="color: var(--pos, #4caf50); font-weight: 600;">reativar</button>`;

      return `
        <li class="usuario ${u.ativo ? "" : "inativo"}">
          <div class="usuario-info">
            <strong>${u.nome ?? u.email}${ehEu ? ' <span class="badge-voce">você</span>' : ""}</strong>
            <span>${u.username ? "@" + u.username : u.email} · ${saldoDe(u)} CRC · ${comprasCount} compras${u.ativo ? "" : " · inativo"}</span>
          </div>
          <div class="usuario-acoes">
            <select class="select-cargo select-retro" data-cargo="${u.id}"${ehEu ? " disabled title='Você não pode mudar o próprio cargo'" : ""}>${options}</select>
            <input type="number" class="ajuste" placeholder="± pts" data-id="${u.id}" />
            <button class="btn-ajuste" data-id="${u.id}">Ajustar</button>
            ${actionButton}
          </div>
        </li>`;
    })
    .join("");

  listaEl.querySelectorAll(".btn-ajuste").forEach((btn) =>
    btn.addEventListener("click", () => ajustar(btn.dataset.id))
  );
  listaEl.querySelectorAll(".btn-desativar").forEach((btn) =>
    btn.addEventListener("click", () => desativar(btn.dataset.id))
  );
  listaEl.querySelectorAll(".btn-ativar").forEach((btn) =>
    btn.addEventListener("click", () => reativar(btn.dataset.id))
  );
  listaEl.querySelectorAll(".select-cargo").forEach((sel) =>
    sel.addEventListener("change", () => mudarCargo(sel.dataset.cargo, sel.value))
  );
}

async function mudarCargo(usuarioId, cargo) {
  listaAviso.textContent = "";
  listaAviso.classList.remove("erro");

  const res = await fetch("/api/usuarios", {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ usuario_id: usuarioId, cargo_codigo: cargo }),
  });

  if (!res.ok) {
    const d = await res.json();
    listaAviso.textContent = d.error || "Erro ao mudar cargo.";
    listaAviso.classList.add("erro");
    return;
  }

  listaAviso.textContent = "Cargo updated.";
  carregar();
}

const usuarioBusca = document.querySelector("#usuario-busca");
if (usuarioBusca) {
  usuarioBusca.addEventListener("input", () => {
    const t = usuarioBusca.value.trim().toLowerCase();
    renderUsuarios(
      t
        ? usuariosTodos.filter(
            (u) =>
              (u.nome || "").toLowerCase().includes(t) ||
              (u.email || "").toLowerCase().includes(t) ||
              (u.username || "").toLowerCase().includes(t)
          )
        : usuariosTodos
    );
  });
}

async function ajustar(usuarioId) {
  listaAviso.textContent = "";
  listaAviso.classList.remove("erro");

  const input = listaEl.querySelector(`.ajuste[data-id="${usuarioId}"]`);
  const valor = parseInt(input.value, 10);
  if (!valor) {
    listaAviso.textContent = "Informe um valor diferente de zero.";
    listaAviso.classList.add("erro");
    return;
  }

  const { error } = await supabase.rpc("ajustar_saldo", {
    p_usuario_id: usuarioId,
    p_valor: valor,
    p_descricao: "Ajuste pelo admin",
  });

  if (error) {
    listaAviso.textContent = error.message;
    listaAviso.classList.add("erro");
    return;
  }

  listaAviso.textContent = "Saldo ajustado.";
  carregar();
}

async function desativar(usuarioId) {
  if (!confirm("Desativar este usuário e tirá-lo da allowlist?")) return;

  const res = await fetch("/api/usuarios", {
    method: "DELETE",
    headers: await authHeaders(),
    body: JSON.stringify({ usuario_id: usuarioId }),
  });

  if (!res.ok) {
    const dados = await res.json();
    listaAviso.textContent = dados.error || "Erro ao desativar.";
    listaAviso.classList.add("erro");
    return;
  }

  carregar();
}

async function reativar(usuarioId) {
  listaAviso.textContent = "";
  listaAviso.classList.remove("erro");

  const res = await fetch("/api/usuarios", {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ usuario_id: usuarioId, ativo: true }),
  });

  if (!res.ok) {
    const dados = await res.json();
    listaAviso.textContent = dados.error || "Erro ao reativar.";
    listaAviso.classList.add("erro");
    return;
  }

  listaAviso.textContent = "Usuário reativado com sucesso.";
  carregar();
}

wlForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  wlAviso.textContent = "";
  wlAviso.classList.remove("erro");

  const res = await fetch("/api/usuarios", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      email: document.querySelector("#wl-email").value.trim(),
      nome: document.querySelector("#wl-nome").value.trim() || null,
    }),
  });

  const dados = await res.json();
  if (!res.ok) {
    wlAviso.textContent = dados.error || "Erro ao adicionar.";
    wlAviso.classList.add("erro");
    return;
  }

  wlForm.reset();
  wlAviso.textContent = "E-mail autorizado!";
  carregarPendentes();
});

async function carregarPendentes() {
  const ul = document.querySelector("#pendentes-lista");
  if (!ul) return;
  ul.innerHTML = "<li class='vazio'>Carregando…</li>";
  const res = await fetch("/api/usuarios?pendentes=1", { headers: await authHeaders() });
  const data = await res.json().catch(() => []);
  if (!res.ok || !Array.isArray(data) || data.length === 0) {
    ul.innerHTML = "<li class='vazio'>Ninguém pendente — todos já criaram a conta. 🎉</li>";
    return;
  }
  ul.innerHTML = data
    .map(
      (p) => `
      <li class="usuario">
        <div class="usuario-info">
          <strong>${p.nome || p.email}</strong>
          <span>${p.email}</span>
        </div>
        <span class="badge-pendente" style="font-size:11px;padding:4px 10px;border-radius:9999px;font-weight:700;">Pendente</span>
      </li>`
    )
    .join("");
}

const wlCsv = document.querySelector("#wl-csv");
const wlCsvAviso = document.querySelector("#wl-csv-aviso");

if (wlCsv) {
  wlCsv.addEventListener("change", async (e) => {
    wlCsvAviso.textContent = "";
    wlCsvAviso.classList.remove("erro", "sucesso");

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
          throw new Error("O arquivo CSV está vazio.");
        }

        let startIndex = 0;
        const firstLine = lines[0].toLowerCase();
        let emailIndex = 0;
        let nameIndex = -1;

        if (firstLine.includes("email") || firstLine.includes("e-mail") || firstLine.includes("nome") || firstLine.includes("name")) {
          const cols = lines[0].split(/[;,]/).map(c => c.trim().toLowerCase());
          emailIndex = cols.findIndex(c => c.includes("email") || c.includes("e-mail"));
          nameIndex = cols.findIndex(c => c.includes("nome") || c.includes("name"));
          
          if (emailIndex === -1) {
            emailIndex = 0;
          }
          startIndex = 1;
        }

        const emails = [];
        for (let i = startIndex; i < lines.length; i++) {
          const parts = lines[i].split(/[;,]/);
          const email = (parts[emailIndex] || "").trim();
          const nome = nameIndex !== -1 && parts[nameIndex] ? parts[nameIndex].trim() : null;

          if (email && email.includes("@")) {
            emails.push({ email, nome });
          }
        }

        if (emails.length === 0) {
          throw new Error("Nenhum e-mail válido foi encontrado no arquivo.");
        }

        wlCsvAviso.textContent = `Enviando ${emails.length} registros...`;
        wlCsvAviso.classList.remove("erro");

        const res = await fetch("/api/usuarios", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ emails }),
        });

        const dados = await res.json();
        if (!res.ok) {
          throw new Error(dados.error || "Erro na resposta do servidor.");
        }

        wlCsvAviso.textContent = `Importação concluída com sucesso! ${emails.length} e-mails autorizados.`;
        wlCsvAviso.classList.add("sucesso");
        wlCsv.value = ""; // Reset input
        carregarPendentes();
      } catch (err) {
        wlCsvAviso.textContent = err.message;
        wlCsvAviso.classList.add("erro");
      }
    };
    reader.readAsText(file);
  });
}


const prodForm = document.querySelector("#form-produto");
const prodLista = document.querySelector("#produtos-admin");
const prodTitulo = document.querySelector("#prod-titulo");
const prodAviso = document.querySelector("#prod-aviso");

const prodId = document.querySelector("#prod-id");
const prodNome = document.querySelector("#prod-nome");
const prodDescricao = document.querySelector("#prod-descricao");
const prodPreco = document.querySelector("#prod-preco");
const prodEstoque = document.querySelector("#prod-estoque");
const prodImagem = document.querySelector("#prod-imagem");
const prodAtivo = document.querySelector("#prod-ativo");
const prodCategoria = document.querySelector("#prod-categoria");

const meditModal = document.querySelector("#modal-produto");
const meditId = document.querySelector("#medit-id");
const meditNome = document.querySelector("#medit-nome");
const meditDescricao = document.querySelector("#medit-descricao");
const meditPreco = document.querySelector("#medit-preco");
const meditEstoque = document.querySelector("#medit-estoque");
const meditImagem = document.querySelector("#medit-imagem");
const meditAtivo = document.querySelector("#medit-ativo");
const meditAviso = document.querySelector("#medit-aviso");
const meditFileName = document.querySelector("#medit-file-name");
const meditCategoria = document.querySelector("#medit-categoria");

let produtosTodos = [];
const produtosImgs = {};
const ESTOQUE_BAIXO = 5;

async function carregarProdutos() {
  prodLista.innerHTML = Array(4).fill(0).map(() => `
    <li class="skeleton-row" style="border: none; padding: 14px 0; display: flex; align-items: center; justify-content: space-between; width: 100%;">
      <div class="usuario-info prod-info" style="display: flex; align-items: center; gap: 12px; width: 100%;">
        <div class="skeleton prod-thumb" style="width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;"></div>
        <div class="skeleton-text" style="flex-grow: 1;">
          <div class="skeleton skeleton-line1" style="width: 40%; height: 14px;"></div>
          <div class="skeleton skeleton-line2" style="width: 60%; height: 10px; margin-top: 6px;"></div>
        </div>
      </div>
      <div class="usuario-acoes" style="display: flex; gap: 8px;">
        <div class="skeleton" style="width: 50px; height: 20px; border-radius: 4px;"></div>
        <div class="skeleton" style="width: 50px; height: 20px; border-radius: 4px;"></div>
      </div>
    </li>
  `).join("");

  const { data } = await supabase
    .from("produtos")
    .select("id, nome, preco, estoque, ativo, imagem_url, categoria")
    .order("nome");

  if (!data || data.length === 0) {
    produtosTodos = [];
    prodLista.innerHTML = "<li class='vazio'>Nenhum produto cadastrado.</li>";
    return;
  }

  const imgs = await Promise.all(data.map((p) => urlImagem(p.imagem_url)));
  produtosTodos = data;
  data.forEach((p, i) => (produtosImgs[p.id] = imgs[i]));

  renderProdutos(produtosTodos);
}

function renderProdutos(lista) {
  if (!lista.length) {
    prodLista.innerHTML = "<li class='vazio'>Nenhum produto encontrado.</li>";
    return;
  }

  prodLista.innerHTML = lista
    .map((p) => {
      const img = produtosImgs[p.id];
      const baixo = p.estoque <= ESTOQUE_BAIXO;
      return `
      <li class="usuario ${p.ativo ? "" : "inativo"}">
        <div class="usuario-info prod-info">
          <div class="prod-thumb">${img ? `<img src="${img}" alt="" />` : '<i class="ph-fill ph-image"></i>'}</div>
          <div>
            <strong>${p.nome}</strong>
            <span>${p.preco} CRC · ${p.estoque} em estoque${
        baixo ? ` <span class="badge-estoque">estoque baixo</span>` : ""
      }${p.ativo ? "" : " · inativo"}</span>
          </div>
        </div>
        <div class="usuario-acoes">
          <button class="link" data-editar="${p.id}">editar</button>
          <button class="link btn-desativar" data-excluir="${p.id}">excluir</button>
        </div>
      </li>`;
    })
    .join("");

  prodLista.querySelectorAll("[data-editar]").forEach((b) =>
    b.addEventListener("click", () => editar(b.dataset.editar, produtosTodos))
  );
  prodLista.querySelectorAll("[data-excluir]").forEach((b) =>
    b.addEventListener("click", () => excluir(b.dataset.excluir))
  );
}

const prodBusca = document.querySelector("#prod-busca");
if (prodBusca) {
  prodBusca.addEventListener("input", () => {
    const t = prodBusca.value.trim().toLowerCase();
    renderProdutos(
      t
        ? produtosTodos.filter(
            (p) =>
              p.nome.toLowerCase().includes(t) ||
              (p.categoria || "").toLowerCase().includes(t)
          )
        : produtosTodos
    );
  });
}

let removerImg = false;

function editar(id, lista) {
  const p = lista.find((x) => x.id === id);
  if (!p) return;
  removerImg = false;
  meditId.value = p.id;
  meditNome.value = p.nome;
  meditPreco.value = p.preco;
  meditEstoque.value = p.estoque;
  meditCategoria.value = p.categoria ?? "";
  meditAtivo.checked = p.ativo;
  meditImagem.value = "";
  meditFileName.textContent = "Manter imagem atual...";
  meditAviso.textContent = "";
  meditAviso.classList.remove("erro");
  // descricao não vem na listagem; busca rápida
  supabase
    .from("produtos")
    .select("descricao")
    .eq("id", id)
    .maybeSingle()
    .then(({ data }) => (meditDescricao.value = data?.descricao ?? ""));
  meditModal.hidden = false;
}

async function excluir(id) {
  if (!confirm("Tem certeza de que deseja excluir este produto?")) return;

  const { data, error } = await supabase.rpc("deletar_produto", { p_id: id });
  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }

  if (data === "desativado") {
    alert("O produto possui histórico de pedidos e foi desativado em vez de excluído para preservar o histórico de compras.");
  } else {
    alert("Produto excluído com sucesso.");
  }

  carregarProdutos();
}

function limparForm() {
  prodForm.reset();
  prodId.value = "";
  prodAtivo.checked = true;
  prodAviso.textContent = "";
  prodAviso.classList.remove("erro");
  const nameEl = document.querySelector("#file-name");
  if (nameEl) {
    nameEl.textContent = "Escolher imagem do produto...";
  }
}

if (prodImagem) {
  prodImagem.addEventListener("change", (e) => {
    const file = e.target.files[0];
    const nameEl = document.querySelector("#file-name");
    if (nameEl) {
      nameEl.textContent = file ? file.name : "Escolher imagem do produto...";
    }
  });
}

meditImagem.addEventListener("change", (e) => {
  const f = e.target.files[0];
  removerImg = false;
  meditFileName.textContent = f ? f.name : "Manter imagem atual...";
});
document.querySelector("#medit-remover-img").addEventListener("click", () => {
  removerImg = true;
  meditImagem.value = "";
  meditFileName.textContent = "Imagem será removida ao salvar";
});
document
  .querySelector("#medit-fechar")
  .addEventListener("click", () => (meditModal.hidden = true));
meditModal.addEventListener("click", (e) => {
  if (e.target === meditModal) meditModal.hidden = true;
});

document.querySelector("#form-editar-produto").addEventListener("submit", async (e) => {
  e.preventDefault();
  meditAviso.textContent = "";
  meditAviso.classList.remove("erro");
  const salvar = document.querySelector("#medit-salvar");
  salvar.disabled = true;

  try {
    // null = mantém imagem atual; "" = remove; caminho = nova imagem
    let caminhoImagem = removerImg ? "" : null;
    if (meditImagem.files[0]) caminhoImagem = await uploadImagem(meditImagem.files[0]);

    const { error } = await supabase.rpc("salvar_produto", {
      p_id: meditId.value,
      p_nome: meditNome.value.trim(),
      p_descricao: meditDescricao.value.trim() || null,
      p_preco: parseInt(meditPreco.value, 10),
      p_estoque: parseInt(meditEstoque.value, 10),
      p_imagem_url: caminhoImagem,
      p_ativo: meditAtivo.checked,
      p_categoria: meditCategoria.value.trim() || null,
    });

    if (error) throw error;

    meditModal.hidden = true;
    carregarProdutos();
  } catch (err) {
    meditAviso.textContent = err.message || "Erro ao salvar.";
    meditAviso.classList.add("erro");
  } finally {
    salvar.disabled = false;
  }
});

prodForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  prodAviso.textContent = "";
  prodAviso.classList.remove("erro");

  const salvarBtn = document.querySelector("#prod-salvar");
  salvarBtn.disabled = true;

  try {
    let caminhoImagem = null;
    if (prodImagem.files[0]) {
      caminhoImagem = await uploadImagem(prodImagem.files[0]);
    }

    const { error } = await supabase.rpc("salvar_produto", {
      p_id: prodId.value || null,
      p_nome: prodNome.value.trim(),
      p_descricao: prodDescricao.value.trim() || null,
      p_preco: parseInt(prodPreco.value, 10),
      p_estoque: parseInt(prodEstoque.value, 10),
      p_imagem_url: caminhoImagem,
      p_ativo: prodAtivo.checked,
      p_categoria: prodCategoria.value.trim() || null,
    });

    if (error) throw error;

    limparForm();
    prodAviso.textContent = "Produto salvo!";
    carregarProdutos();
  } catch (err) {
    prodAviso.textContent = err.message || "Erro ao salvar.";
    prodAviso.classList.add("erro");
  } finally {
    salvarBtn.disabled = false;
  }
});

const pedidosLista = document.querySelector("#pedidos-lista");
const pedidosAviso = document.querySelector("#pedidos-aviso");

let pedidosCompletos = [];
let filtroPedidoAtivo = "todos";

document.querySelectorAll(".btn-filtro-pedido").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".btn-filtro-pedido").forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    filtroPedidoAtivo = btn.dataset.filtro;
    filtrarEApresentarPedidos();
  });
});

function filtrarEApresentarPedidos() {
  let filtrados = pedidosCompletos;
  if (filtroPedidoAtivo !== "todos") {
    filtrados = filtrados.filter((p) => p.status === filtroPedidoAtivo);
  }
  const t = (document.querySelector("#pedido-busca")?.value || "").trim().toLowerCase();
  if (t) {
    filtrados = filtrados.filter(
      (p) =>
        (p.usuarios?.nome || "").toLowerCase().includes(t) ||
        (p.usuarios?.email || "").toLowerCase().includes(t) ||
        p.id.toLowerCase().includes(t) ||
        (p.pedido_itens ?? []).some((it) =>
          (it.produtos?.nome || "").toLowerCase().includes(t)
        )
    );
  }
  renderPedidos(filtrados);
}

const pedidoBusca = document.querySelector("#pedido-busca");
if (pedidoBusca) {
  pedidoBusca.addEventListener("input", filtrarEApresentarPedidos);
}

function atualizarMetricasPedidos(pedidos) {
  const set = (id, v) => {
    const el = document.querySelector(id);
    if (el) el.textContent = v;
  };
  const total = pedidos.length;
  const pendentes = pedidos.filter((p) => p.status === "pendente").length;
  const entregues = pedidos.filter((p) => p.status === "entregue").length;
  const faturamento = pedidos
    .filter((p) => p.status === "confirmado" || p.status === "entregue")
    .reduce((sum, p) => sum + (p.total || 0), 0);

  set("#pedidos-total-count", total);
  set("#pedidos-pendentes-count", pendentes);
  set("#pedidos-entregues-count", entregues);
  set("#pedidos-faturado-total", faturamento);
}

async function carregarPedidos() {
  if (!pedidosLista || !pedidosAviso) return;
  
  pedidosAviso.textContent = "";
  pedidosAviso.classList.remove("erro");

  pedidosLista.innerHTML = Array(3).fill(0).map(() => `
    <li class="skeleton-row" style="flex-direction: column; align-items: stretch; gap: 12px; padding: 16px; border: none; border-bottom: 1px solid var(--soft); display: flex; width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border); padding-bottom: 8px;">
        <div class="skeleton" style="width: 100px; height: 16px;"></div>
        <div class="skeleton" style="width: 80px; height: 20px; border-radius: 4px;"></div>
      </div>
      <div class="skeleton-text">
        <div class="skeleton skeleton-line1" style="width: 70%; height: 12px;"></div>
        <div class="skeleton skeleton-line2" style="width: 40%; height: 10px; margin-top: 6px;"></div>
      </div>
      <div class="skeleton" style="width: 100%; height: 40px; border-radius: 6px;"></div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <div class="skeleton" style="width: 80px; height: 18px;"></div>
        <div class="skeleton" style="width: 120px; height: 26px; border-radius: 4px;"></div>
      </div>
    </li>
  `).join("");

  try {
    const res = await fetch("/api/pedidos", { headers: await authHeaders() });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Erro ao carregar pedidos.");
    }
    const data = await res.json();
    pedidosCompletos = data || [];
    atualizarMetricasPedidos(pedidosCompletos);
    filtrarEApresentarPedidos();
  } catch (err) {
    pedidosAviso.textContent = err.message;
    pedidosAviso.classList.add("erro");
  }
}

async function renderPedidos(pedidos) {
  if (!pedidos || pedidos.length === 0) {
    pedidosLista.innerHTML = "<li class='vazio'>Nenhum pedido encontrado.</li>";
    return;
  }

  const imgMap = {};
  const caminhos = [
    ...new Set(
      pedidos.flatMap((p) =>
        (p.pedido_itens ?? []).map((it) => it.produtos?.imagem_url).filter(Boolean)
      )
    ),
  ];
  await Promise.all(
    caminhos.map(async (c) => {
      imgMap[c] = await urlImagem(c);
    })
  );

  pedidosLista.innerHTML = pedidos
    .map((p) => {
      const dataStr = new Date(p.criado_em).toLocaleString("pt-BR");
      const itensHtml = (p.pedido_itens ?? [])
        .map((it) => {
          const img = it.produtos?.imagem_url ? imgMap[it.produtos.imagem_url] : null;
          return `
            <div class="pedido-item">
              <div class="pedido-item-thumb">${img ? `<img src="${img}" alt="" />` : '<i class="ph-fill ph-image"></i>'}</div>
              <span class="pedido-item-nome">${it.quantidade}× ${it.produtos?.nome || "Produto"}</span>
              <b>${it.preco_unitario} pts</b>
            </div>`;
        })
        .join("");

      const statusOptions = ["pendente", "confirmado", "cancelado", "entregue"]
        .map((st) => `<option value="${st}" ${p.status === st ? "selected" : ""}>${st.toUpperCase()}</option>`)
        .join("");

      let slaBadge = "";
      if (p.status === "pendente" || p.status === "confirmado") {
        const horas = Math.floor((new Date() - new Date(p.criado_em)) / (1000 * 60 * 60));
        if (horas >= 48) {
          slaBadge = `<span class="badge-sla-atrasado" style="background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; vertical-align: middle;"><i class="ph-fill ph-warning-octagon"></i> CRÍTICO (+48h)</span>`;
        } else if (horas >= 24) {
          slaBadge = `<span class="badge-sla-alerta" style="background: #ffedd5; color: #f97316; border: 1px solid #fed7aa; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; vertical-align: middle;"><i class="ph-fill ph-warning"></i> ATENÇÃO (+24h)</span>`;
        } else {
          slaBadge = `<span class="badge-sla-ok" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; vertical-align: middle;"><i class="ph-fill ph-clock"></i> NO PRAZO</span>`;
        }
      }

      return `
        <li class="pedido-card status-${p.status}">
          <div class="pedido-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <strong>Pedido #${p.id.slice(0, 8)}</strong>
              ${slaBadge}
            </div>
            <span class="badge-${p.status}" style="font-weight: 700; font-size: 11px; padding: 4px 8px; border-radius: 4px;">${p.status.toUpperCase()}</span>
          </div>
          <div class="pedido-card-body">
            <b>Comprador:</b> ${p.usuarios?.nome || "Sem nome"} (${p.usuarios?.email || "Sem e-mail"})<br/>
            <b>Data:</b> ${dataStr}
          </div>
          <div class="pedido-card-itens">
            ${itensHtml}
          </div>
          <div class="pedido-card-footer">
            <div style="font-weight: 700; color: var(--orange); font-size: 15px;">
              Total: ${p.total} pts
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; color: var(--muted); font-weight: 600;">Status:</span>
              <select class="status-select select-retro status-${p.status}" data-id="${p.id}">
                ${statusOptions}
              </select>
            </div>
          </div>
        </li>`;
    })
    .join("");

  pedidosLista.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", async (e) => {
      const id = select.dataset.id;
      const novoStatus = select.value;
      select.className = `status-select select-retro status-${novoStatus}`;
      await alterarStatusPedido(id, novoStatus);
    });
  });
}

async function alterarStatusPedido(pedidoId, status) {
  pedidosAviso.textContent = "";
  pedidosAviso.classList.remove("erro", "sucesso");

  try {
    const res = await fetch("/api/pedidos", {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify({ pedido_id: pedidoId, status }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Erro ao atualizar status.");
    }

    pedidosAviso.textContent = "Status do pedido atualizado!";
    pedidosAviso.classList.add("sucesso");
    setTimeout(() => {
      pedidosAviso.textContent = "";
      pedidosAviso.classList.remove("sucesso");
    }, 3000);

    carregarPedidos();
  } catch (err) {
    pedidosAviso.textContent = err.message;
    pedidosAviso.classList.add("erro");
  }
}

const campForm = document.querySelector("#form-campanha");
if (campForm) {
  const campTabs = document.querySelector("#camp-tabs");
  const campCodigo = document.querySelector("#camp-codigo");
  const campLabel = document.querySelector("#camp-valor-label");
  const campPreview = document.querySelector("#camp-link-preview");
  const campLista = document.querySelector("#campanhas-lista");
  const campAviso = document.querySelector("#camp-aviso");
  let campTipo = "codigo";

  function atualizarPreview() {
    campPreview.textContent =
      `${window.location.origin}/carteira?codigo=` + (campCodigo.value || "");
  }

  function renderCampanhas(lista) {
    if (!lista || lista.length === 0) {
      campLista.innerHTML = "<li class='vazio'>Nenhuma campanha ainda.</li>";
      return;
    }
    campLista.innerHTML = lista
      .map((c) => {
        const usos = `${c.usos}${c.limite ? "/" + c.limite : ""}`;
        const ref =
          c.tipo === "codigo"
            ? '<i class="ph-fill ph-tag"></i> ' + c.codigo
            : '<i class="ph-fill ph-link"></i> …/carteira?codigo=' + c.codigo;
        const valorCopiar =
          c.tipo === "codigo" ? c.codigo : `${window.location.origin}/carteira?codigo=${c.codigo}`;
        return `
        <li class="usuario ${c.ativo ? "" : "inativo"}">
          <div class="usuario-info">
            <strong>${c.nome}</strong>
            <span>${ref} · ${c.pontos} CRC · usos: ${usos}${
          c.validade ? " · até " + c.validade : ""
        }</span>
          </div>
          <div class="usuario-acoes">
            <span class="badge-${c.ativo ? "entregue" : "cancelado"}" style="font-size: 11px; padding: 4px 8px; border-radius: 4px; font-weight: 700;">${
          c.ativo ? "ATIVA" : "INATIVA"
        }</span>
            <button class="link" type="button" data-acao="copiar" data-valor="${valorCopiar}" title="Copiar"><i class="ph-fill ph-copy"></i></button>
            <button class="link" type="button" data-acao="toggle" data-id="${c.id}" data-ativo="${c.ativo}" title="${c.ativo ? "Desativar" : "Reativar"}"><i class="ph-fill ph-${c.ativo ? "pause" : "play"}"></i></button>
            <button class="link" type="button" data-acao="excluir" data-id="${c.id}" title="Excluir"><i class="ph-fill ph-trash"></i></button>
          </div>
        </li>`;
      })
      .join("");
  }

  campLista.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-acao]");
    if (!btn) return;
    const acao = btn.dataset.acao;

    if (acao === "copiar") {
      try {
        await navigator.clipboard.writeText(btn.dataset.valor);
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="ph-fill ph-check"></i>';
        setTimeout(() => (btn.innerHTML = original), 1200);
      } catch {}
      return;
    }

    if (acao === "toggle") {
      const novo = btn.dataset.ativo !== "true";
      await supabase.from("campanhas").update({ ativo: novo }).eq("id", btn.dataset.id);
      carregarCampanhas();
      return;
    }

    if (acao === "excluir") {
      if (!confirm("Excluir esta campanha? Esta ação não pode ser desfeita.")) return;
      await supabase.from("campanhas").delete().eq("id", btn.dataset.id);
      carregarCampanhas();
    }
  });

  async function carregarCampanhas() {
    const { data } = await supabase
      .from("campanhas")
      .select("*")
      .order("criado_em", { ascending: false });
    renderCampanhas(data || []);
  }

  campTabs.querySelectorAll(".type-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      campTabs.querySelectorAll(".type-tab").forEach((t) => t.classList.remove("on"));
      tab.classList.add("on");
      campTipo = tab.dataset.tipo;
      if (campTipo === "codigo") {
        campLabel.textContent = "Código exclusivo";
        campCodigo.placeholder = "Ex: META50";
        campCodigo.style.textTransform = "uppercase";
        campPreview.hidden = true;
      } else {
        campLabel.textContent = "Slug do link";
        campCodigo.placeholder = "Ex: meta-junho";
        campCodigo.style.textTransform = "none";
        campPreview.hidden = false;
        atualizarPreview();
      }
    })
  );

  document.querySelector("#camp-gerar").addEventListener("click", () => {
    if (campTipo === "codigo") {
      campCodigo.value = Array.from(
        { length: 6 },
        () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
      ).join("");
    } else {
      campCodigo.value = "camp-" + Math.random().toString(36).slice(2, 8);
    }
    atualizarPreview();
  });

  campCodigo.addEventListener("input", atualizarPreview);

  campForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    campAviso.textContent = "";
    campAviso.classList.remove("erro");

    const limite = document.querySelector("#camp-limite").value;
    const validade = document.querySelector("#camp-validade").value;

    const { error } = await supabase.rpc("salvar_campanha", {
      p_id: null,
      p_nome: document.querySelector("#camp-nome").value.trim(),
      p_tipo: campTipo,
      p_codigo: campCodigo.value.trim(),
      p_pontos: parseInt(document.querySelector("#camp-pontos").value, 10),
      p_limite: limite ? parseInt(limite, 10) : null,
      p_validade: validade || null,
      p_ativo: document.querySelector("#camp-ativo").checked,
    });

    if (error) {
      campAviso.textContent = error.message.includes("duplicate")
        ? "Já existe uma campanha com esse código."
        : error.message;
      campAviso.classList.add("erro");
      return;
    }

    campForm.reset();
    document.querySelector("#camp-ativo").checked = true;
    campAviso.textContent = "Campanha criada!";
    carregarCampanhas();
  });

  carregarCampanhas();
}
