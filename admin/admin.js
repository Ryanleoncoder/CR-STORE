import { supabase } from "../js/supabase.js";
import { requireAuth, logout } from "../js/auth.js";
import { getAccessToken } from "../js/auth-token.js";
import { urlImagem, uploadImagem } from "../js/storage.js";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true
});

const restrito = document.querySelector("#restrito");
const painel = document.querySelector("#painel");
const listaEl = document.querySelector("#usuarios");
const listaAviso = document.querySelector("#lista-aviso");
const wlForm = document.querySelector("#form-whitelist");
const wlAviso = document.querySelector("#wl-aviso");

document.querySelector("#sair").addEventListener("click", logout);

(function initSidebar() {
  const layout = document.querySelector(".admin-layout");
  if (!layout) return;
  const setOculta = (oculta) => {
    layout.classList.toggle("sidebar-collapsed", oculta);
    try { localStorage.setItem("sidebarHide", oculta ? "true" : "false"); } catch {}
  };
  let oculta = false;
  try { oculta = localStorage.getItem("sidebarHide") === "true"; } catch {}
  layout.classList.toggle("sidebar-collapsed", oculta);
  document.querySelector("#sidebar-toggle")?.addEventListener("click", () => setOculta(true));
  document.querySelector("#sidebar-show")?.addEventListener("click", () => setOculta(false));
})();

(function initGuiaStudio() {
  const guia = document.querySelector("#studio-guia");
  if (!guia) return;
  const btnAbrir = document.querySelector("#btn-studio-guia");
  const setOculto = (oculto) => {
    guia.style.display = oculto ? "none" : "";
    if (btnAbrir) btnAbrir.style.display = oculto ? "inline-flex" : "none";
    try { localStorage.setItem("studioGuiaOculto", oculto ? "true" : "false"); } catch {}
  };
  let oculto = false;
  try { oculto = localStorage.getItem("studioGuiaOculto") === "true"; } catch {}
  setOculto(oculto);
  document.querySelector("#btn-studio-guia-fechar")?.addEventListener("click", () => setOculto(true));
  btnAbrir?.addEventListener("click", () => setOculto(false));
})();

document.querySelectorAll(".sidebar-nav [data-sec]").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-nav [data-sec]").forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    document.querySelectorAll(".sec[data-sec]").forEach((s) => (s.hidden = s.dataset.sec !== btn.dataset.sec));
    
    document.querySelector(".admin-main")?.classList.remove("studio-mode");

    if (btn.dataset.sec === "pedidos") {
      carregarPedidos();
    }
    if (btn.dataset.sec === "acessos") {
      carregarPendentes();
    }
    if (btn.dataset.sec === "anuncios-admin") {
      carregarAnunciosAdmin();
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
    .map((p) => {
      const prazo = prazoWhitelist(p.expira_em);
      return `
      <li class="usuario">
        <div class="usuario-info">
          <strong>${p.nome || p.email}</strong>
          <span>${p.email}</span>
        </div>
        <span class="badge-pendente ${prazo.cls}" title="${prazo.titulo}" style="font-size:11px;padding:4px 10px;border-radius:9999px;font-weight:700;">${prazo.texto}</span>
        <button type="button" class="btn-remover-wl" data-email="${p.email}" title="Remover da lista" style="margin-left:8px;background:none;border:none;cursor:pointer;color:var(--neg);font-size:16px;line-height:1;"><i class="ph-fill ph-trash"></i></button>
      </li>`;
    })
    .join("");

  ul.querySelectorAll(".btn-remover-wl").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;
      if (!confirm(`Remover ${email} da lista de acesso? A pessoa não conseguirá mais fazer o primeiro acesso.`)) return;
      const res = await fetch("/api/usuarios", {
        method: "DELETE",
        headers: await authHeaders(),
        body: JSON.stringify({ whitelist_email: email }),
      });
      if (res.ok) carregarPendentes();
      else alert("Não foi possível remover.");
    });
  });
}

function prazoWhitelist(expira_em) {
  if (!expira_em) return { texto: "Pendente", cls: "", titulo: "" };
  const ms = new Date(expira_em) - new Date();
  const dias = Math.ceil(ms / (24 * 60 * 60 * 1000));
  const titulo = `Expira em ${new Date(expira_em).toLocaleDateString("pt-BR")}`;
  if (ms <= 0) return { texto: "Prazo expirado", cls: "vencido", titulo };
  if (dias === 1) return { texto: "falta 1 dia", cls: "urgente", titulo };
  return { texto: `faltam ${dias} dias`, cls: dias <= 2 ? "urgente" : "", titulo };
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
}


// STUDIO DE DESAFIOS (Visual Studio & Workspace)

let campanhaAtualId = null;
let faseSelecionadaId = null;
let fasesCampanha = [];
let perguntasFase = [];
let perguntasImgs = {}; // Cache de URLs de imagens de perguntas


let perguntasModel = [];        
let tmpSeq = 0;                 
let studioSujo = false;         
let draftTimer = null;          
const RASCUNHO_PREFIXO = "cr_studio_rascunho_";

const LETRAS = ["A", "B", "C", "D", "E", "F", "G", "H"];


const cdDashboard = document.querySelector("#cd-dashboard");
const cdStudio = document.querySelector("#cd-studio");
const cdDashboardAviso = document.querySelector("#cd-dashboard-aviso");
const cdStudioAviso = document.querySelector("#cd-studio-aviso");
const cdStudioTitulo = document.querySelector("#cd-studio-titulo");
const campDesafiosLista = document.querySelector("#camp-desafios-lista");

const btnCdNova = document.querySelector("#btn-cd-nova");
const btnCdVoltar = document.querySelector("#btn-cd-voltar");


const formStudioCampanha = document.querySelector("#form-studio-campanha");
const formStudioFase = document.querySelector("#form-studio-fase");
const fasesStudioLista = document.querySelector("#fases-studio-lista");
const perguntasStudioLista = document.querySelector("#perguntas-studio-lista");

const studioFasesBloco = document.querySelector("#studio-fases-bloco");
const cdStudioRightPanel = document.querySelector("#cd-studio-right-panel");
const faseEditorVazio = document.querySelector("#fase-editor-vazio");
const faseEditorAtivo = document.querySelector("#fase-editor-ativo");

const btnStudioAddFase = document.querySelector("#btn-studio-add-fase");
const btnStudioAddPergunta = document.querySelector("#btn-studio-add-pergunta");
const btnStudioAddPerguntaFim = document.querySelector("#btn-studio-add-pergunta-fim");
const btnSalvarAjustesFaseTopo = document.querySelector("#btn-salvar-ajustes-fase-topo");


if (cdStudioRightPanel) {
  const aoEditar = () => { marcarStudioSujo(); agendarRascunho(); };
  cdStudioRightPanel.addEventListener("input", aoEditar);
  cdStudioRightPanel.addEventListener("change", aoEditar);
}

window.addEventListener("beforeunload", (e) => {
  if (studioSujo) {
    e.preventDefault();
    e.returnValue = "";
  }
});


document.querySelectorAll(".sidebar-nav [data-sec]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.sec === "desafios-admin") {
      voltarAoDashboard();
    }
  });
});

function voltarAoDashboard() {
  const sair = () => {
    if (cdDashboard) cdDashboard.hidden = false;
    if (cdStudio) cdStudio.hidden = true;
    campanhaAtualId = null;
    faseSelecionadaId = null;
    marcarStudioLimpo();
    document.querySelector(".admin-main")?.classList.remove("studio-mode");
    carregarCampanhasDesafios();
  };
  guardarAlteracoes(sair);
}

btnCdVoltar?.addEventListener("click", voltarAoDashboard);
btnCdNova?.addEventListener("click", () => entrarStudio(null));



async function carregarCampanhasDesafios() {
  if (!campDesafiosLista) return;
  campDesafiosLista.innerHTML = `
    <li class="skeleton-row" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--muted);">
      <div class="skeleton" style="width: 100%; height: 120px; border-radius: 16px;"></div>
    </li>`;

  const { data, error } = await supabase
    .from("campanhas_desafios")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) {
    cdDashboardAviso.textContent = "Erro ao carregar campanhas: " + error.message;
    cdDashboardAviso.classList.add("erro");
    campDesafiosLista.innerHTML = '<li class="vazio" style="grid-column:1/-1;">Erro ao carregar campanhas.</li>';
    return;
  }

  if (!data || data.length === 0) {
    campDesafiosLista.innerHTML = `
      <li class="vazio" style="grid-column: 1/-1; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <i class="ph-fill ph-puzzle-piece" style="font-size: 48px; color: var(--muted); opacity: 0.7;"></i>
        <h3 style="font-size: 16px; font-weight: 700; color: var(--ink);">Nenhuma campanha criada</h3>
        <p style="color: var(--muted); font-size: 13px; max-width: 300px; text-align: center; margin: 0;">Clique no botão "Nova Campanha" acima para criar sua primeira trilha de desafios.</p>
      </li>`;
    return;
  }

  const { data: todosDesafios } = await supabase.from("desafios").select("id, campanha_id");
  const countMap = {};
  (todosDesafios || []).forEach(d => {
    countMap[d.campanha_id] = (countMap[d.campanha_id] || 0) + 1;
  });

  const bannerUrls = await Promise.all(data.map(c => urlImagem(c.banner_url)));

  campDesafiosLista.innerHTML = data
    .map((c, i) => {
      const banner = bannerUrls[i];
      const faseCount = countMap[c.id] || 0;
      
      const bannerStyle = banner 
        ? `background-image: url('${banner}');`
        : `background: linear-gradient(135deg, ${c.cor_primaria || '#6366f1'}, ${c.cor_secundaria || '#a78bfa'});`;

      return `
      <li class="cd-card">
        <div class="cd-card-banner" style="${bannerStyle}">
          <span class="cd-card-badge">${c.ativo ? "ATIVA" : "INATIVA"}</span>
        </div>
        <div class="cd-card-body">
          <h3>${c.nome}</h3>
          <p>${c.descricao || "Sem descrição cadastrada."}</p>
          <div class="cd-card-meta">
            <span><i class="ph-fill ph-map-trifold" style="color: var(--orange);"></i> ${faseCount} Fase${faseCount !== 1 ? "s" : ""}</span>
            <span style="margin-left: auto;"><i class="ph-fill ph-lightning" style="color: #6366f1;"></i> ${c.xp_recompensa} XP</span>
            <span><img src="/assets/images/crcoins.webp" alt="CRC" style="width: 14px; height: 14px; object-fit: contain; vertical-align: middle; margin-right: 2px;" /> ${c.pontos_recompensa} CRC</span>
          </div>
        </div>
        <div class="cd-card-footer">
          <button type="button" class="btn-sec-mini" data-editar-cd="${c.id}" data-nome="${c.nome.replace(/"/g, "&quot;")}" style="font-size: 12px; padding: 6px 12px;"><i class="ph-fill ph-pencil-simple" style="margin-right: 4px; vertical-align: middle;"></i> Editar no Studio</button>
          <button type="button" class="link" data-excluir-cd="${c.id}" style="color: var(--neg); font-size: 12px; font-weight: 700;"><i class="ph-fill ph-trash" style="margin-right: 4px; vertical-align: middle;"></i> Excluir</button>
        </div>
      </li>`;
    })
    .join("");

  campDesafiosLista.querySelectorAll("[data-editar-cd]").forEach((btn) => {
    btn.addEventListener("click", () => entrarStudio(btn.dataset.editarCd, btn.dataset.nome));
  });

  campDesafiosLista.querySelectorAll("[data-excluir-cd]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Tem certeza de que deseja excluir esta campanha e todos os seus desafios associados? Esta ação não pode ser desfeita.")) return;
      cdDashboardAviso.textContent = "Excluindo…";
      const { error } = await supabase.from("campanhas_desafios").delete().eq("id", btn.dataset.excluirCd);
      if (error) {
        cdDashboardAviso.textContent = "Erro ao excluir: " + error.message;
        cdDashboardAviso.classList.add("erro");
      } else {
        cdDashboardAviso.textContent = "Campanha excluída com sucesso!";
        cdDashboardAviso.classList.remove("erro");
        carregarCampanhasDesafios();
      }
    });
  });
}

function formatarParaDataLocalInput(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  const hora = String(d.getHours()).padStart(2, "0");
  const minuto = String(d.getMinutes()).padStart(2, "0");
  return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
}

function converterParaUtcIso(localString) {
  if (!localString) return null;
  const d = new Date(localString);
  return isNaN(d.getTime()) ? null : d.toISOString();
}



const MAPA_RATIOS = {
  "3.5-1": "3.5 / 1",
  "2.5-1": "2.5 / 1",
  "16-9": "16 / 9",
  "4-3": "4 / 3"
};

function obterAjusteImagem(url) {
  if (!url) return { url: "", fit: "cover", ratio: "2.5-1" };
  const parts = url.split("#");
  const cleanUrl = parts[0];
  let fit = "cover";
  let ratio = "2.5-1";
  
  if (parts[1]) {
    const params = new URLSearchParams(parts[1]);
    fit = params.get("fit") || "cover";
    ratio = params.get("ratio") || "2.5-1";
  }
  
  return { url: cleanUrl, fit, ratio };
}

function gerarUrlComHash(urlLimpa, fit, ratio) {
  if (!urlLimpa) return "";
  const query = [];
  if (fit !== "cover") query.push(`fit=${fit}`);
  if (ratio !== "2.5-1") query.push(`ratio=${ratio}`);
  return query.length > 0 ? `${urlLimpa}#${query.join("&")}` : urlLimpa;
}

function atualizarPreviewEstilo(el, url, fit, ratio) {
  if (!el) return;
  const parent = el.closest(".studio-upload-box");
  const ratioValue = MAPA_RATIOS[ratio] || "2.5 / 1";
  if (parent) {
    parent.style.aspectRatio = ratioValue;
    parent.style.minHeight = "auto";
  }

  if (fit === "contain-blur") {
    el.style.backgroundImage = `url('${url}')`;
    el.style.backgroundSize = "contain";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.backgroundColor = "rgba(15, 15, 20, 0.85)";
  } else if (fit === "contain") {
    el.style.backgroundImage = `url('${url}')`;
    el.style.backgroundSize = "contain";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.backgroundColor = "var(--canvas)";
  } else {
    el.style.backgroundImage = `url('${url}')`;
    el.style.backgroundSize = "cover";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.backgroundColor = "transparent";
  }
}

async function entrarStudio(campId, campNome) {
  if (cdDashboard) cdDashboard.hidden = true;
  if (cdStudio) cdStudio.hidden = false;
  
  campanhaAtualId = campId;
  faseSelecionadaId = null;
  cdStudioAviso.textContent = "";
  cdStudioAviso.classList.remove("erro");

  document.querySelector(".admin-main")?.classList.add("studio-mode");

  if (faseEditorVazio) faseEditorVazio.hidden = false;
  if (faseEditorAtivo) faseEditorAtivo.hidden = true;

  const defaultCdBanner = document.getElementById("studio-cd-banner-default");
  const previewCdBanner = document.getElementById("studio-cd-banner-preview");
  if (defaultCdBanner) defaultCdBanner.style.display = "flex";
  if (previewCdBanner) {
    previewCdBanner.style.display = "none";
    previewCdBanner.style.backgroundImage = "";
  }
  document.getElementById("studio-cd-banner-url").value = "";
  document.getElementById("studio-cd-banner-file").value = "";
  const cdBannerUrlText = document.getElementById("studio-cd-banner-url-text");
  if (cdBannerUrlText) cdBannerUrlText.value = "";

  if (!campId) {
    // Modo: NOVA CAMPANHA
    cdStudioTitulo.textContent = "Nova Campanha de Desafios";
    formStudioCampanha.reset();
    document.querySelector("#studio-cd-id").value = "";
    document.querySelector("#studio-cd-cor1").value = "#6366f1";
    document.querySelector("#studio-cd-cor2").value = "#a78bfa";
    document.querySelector("#studio-cd-xp").value = "50";
    document.querySelector("#studio-cd-pontos").value = "25";
    document.querySelector("#studio-cd-ativo").checked = true;
    
    if (studioFasesBloco) studioFasesBloco.hidden = true;

    if (faseEditorVazio) {
      faseEditorVazio.innerHTML = `
        <div class="studio-empty-state" style="padding: 40px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <i class="ph-fill ph-sparkles" style="font-size: 48px; color: #eab308; margin-bottom: 16px; opacity: 0.85;"></i>
          <h3 style="font-size: 18px; font-weight: 700; color: var(--ink); margin: 0 0 8px 0;">✨ Criando sua Nova Trilha de Desafios!</h3>
          <p style="max-width: 420px; margin: 0 auto 20px auto; line-height: 1.5; color: var(--muted); font-size: 13px;">
            Para começar a montar suas perguntas e caminhos personalizados, primeiro precisamos criar esta campanha no sistema.
          </p>
          <div style="text-align: left; background: var(--soft); padding: 20px; border-radius: 16px; max-width: 420px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; border: 1px solid var(--border);">
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <span style="background: #6366f1; color: white; font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; line-height: 22px;">1</span>
              <p style="margin: 0; font-size: 12px; color: var(--ink); line-height: 1.4;"><b>Defina as Configurações Básicas:</b> Insira o nome, descrição e suba um banner chamativo na coluna ao lado.</p>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <span style="background: #6366f1; color: white; font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; line-height: 22px;">2</span>
              <p style="margin: 0; font-size: 12px; color: var(--ink); line-height: 1.4;"><b>Clique em Salvar:</b> Use o botão <b>"<i class="ph-fill ph-floppy-disk" style="margin-right: 4px; vertical-align: middle;"></i> Salvar Configurações"</b> no final do formulário ao lado.</p>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <span style="background: #e2e8f0; color: #94a3b8; font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; line-height: 22px;">✓</span>
              <p style="margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4;"><b>A Trilha Desbloqueia!</b> Logo após salvar, a lista de fases (desafios) e o criador de perguntas aparecerão automaticamente para você.</p>
            </div>
          </div>
        </div>
      `;
    }
  } else {
    cdStudioTitulo.textContent = `Studio: ${campNome}`;
    if (studioFasesBloco) studioFasesBloco.hidden = false;

    if (faseEditorVazio) {
      faseEditorVazio.innerHTML = `
        <div class="studio-empty-state" style="padding: 40px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <i class="ph-fill ph-map-trifold" style="font-size: 48px; color: #6366f1; margin-bottom: 16px; opacity: 0.85;"></i>
          <h3 style="font-size: 18px; font-weight: 700; color: var(--ink); margin: 0 0 8px 0;">🗺️ Sua Trilha de Fases está Ativa!</h3>
          <p style="max-width: 420px; margin: 0 auto 20px auto; line-height: 1.5; color: var(--muted); font-size: 13px;">
            Esta campanha já está criada. Agora você pode adicionar fases (etapas) e configurar as perguntas de cada uma delas.
          </p>
          <div style="text-align: left; background: var(--soft); padding: 20px; border-radius: 16px; max-width: 420px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; border: 1px solid var(--border);">
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <span style="background: #6366f1; color: white; font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; line-height: 22px;">＋</span>
              <p style="margin: 0; font-size: 12px; color: var(--ink); line-height: 1.4;"><b>Crie Fases:</b> Clique em <b>"＋ Nova Fase (Desafio)"</b> na coluna da esquerda para adicionar etapas na trilha do jogador.</p>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <span style="background: #6366f1; color: white; font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; line-height: 22px;">❓</span>
              <p style="margin: 0; font-size: 12px; color: var(--ink); line-height: 1.4;"><b>Abra o Editor:</b> Clique em qualquer fase existente na coluna da esquerda para abrir o painel de perguntas e alternativas.</p>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <span style="background: #6366f1; color: white; font-weight: 800; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; line-height: 22px;"><i class="ph-fill ph-copy" style="font-size: 11px; vertical-align: middle;"></i></span>
              <p style="margin: 0; font-size: 12px; color: var(--ink); line-height: 1.4;"><b>Duplique Desafios:</b> Quer clonar uma fase existente? Clique no ícone de cópia <b><i class="ph-fill ph-copy" style="font-size:12px;"></i></b> ao lado da fase para duplicar toda a estrutura e ramificações instantaneamente!</p>
            </div>
          </div>
        </div>
      `;
    }
    
    cdStudioAviso.textContent = "Carregando dados da campanha…";
    const { data: camp, error } = await supabase
      .from("campanhas_desafios")
      .select("*")
      .eq("id", campId)
      .maybeSingle();

    if (error || !camp) {
      cdStudioAviso.textContent = "Erro ao carregar dados da campanha.";
      cdStudioAviso.classList.add("erro");
      return;
    }
    cdStudioAviso.textContent = "";

    document.querySelector("#studio-cd-id").value = camp.id;
    document.querySelector("#studio-cd-nome").value = camp.nome;
    document.querySelector("#studio-cd-descricao").value = camp.descricao || "";
    document.querySelector("#studio-cd-cor1").value = camp.cor_primaria || "#6366f1";
    document.querySelector("#studio-cd-cor2").value = camp.cor_secundaria || "#a78bfa";
    document.querySelector("#studio-cd-xp").value = camp.xp_recompensa;
    document.querySelector("#studio-cd-pontos").value = camp.pontos_recompensa;
    document.querySelector("#studio-cd-inicio").value = formatarParaDataLocalInput(camp.inicio);
    document.querySelector("#studio-cd-fim").value = formatarParaDataLocalInput(camp.fim);
    document.querySelector("#studio-cd-ativo").checked = camp.ativo;
    
    if (camp.banner_url) {
      const { url: cleanUrl, fit, ratio } = obterAjusteImagem(camp.banner_url);
      document.getElementById("studio-cd-banner-url").value = camp.banner_url;
      if (cdBannerUrlText) cdBannerUrlText.value = cleanUrl;
      document.getElementById("studio-cd-banner-fit").value = fit;
      document.getElementById("studio-cd-banner-ratio").value = ratio;
      const url = await urlImagem(cleanUrl);
      if (defaultCdBanner) defaultCdBanner.style.display = "none";
      if (previewCdBanner) {
        previewCdBanner.style.display = "block";
        atualizarPreviewEstilo(previewCdBanner, url, fit, ratio);
      }
    } else {
      document.getElementById("studio-cd-banner-fit").value = "cover";
      document.getElementById("studio-cd-banner-ratio").value = "2.5-1";
      const parent = previewCdBanner?.closest(".studio-upload-box");
      if (parent) {
        parent.style.removeProperty("aspect-ratio");
        parent.style.removeProperty("min-height");
      }
      if (defaultCdBanner) defaultCdBanner.style.display = "flex";
      if (previewCdBanner) {
        previewCdBanner.style.display = "none";
        previewCdBanner.style.backgroundImage = "";
      }
    }

    carregarFasesStudio(camp.id);
  }
}

document.querySelector("#studio-cd-banner-file")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const defaultCdBanner = document.getElementById("studio-cd-banner-default");
  const previewCdBanner = document.getElementById("studio-cd-banner-preview");
  const textLabel = document.getElementById("studio-cd-banner-text");
  if (!file) return;

  if (textLabel) textLabel.textContent = "Subindo banner… ⏳";
  try {
    const path = await uploadImagem(file);
    const fit = document.getElementById("studio-cd-banner-fit").value;
    document.getElementById("studio-cd-banner-url").value = path + (fit !== "cover" ? `#fit=${fit}` : "");
    const cdBannerUrlText = document.getElementById("studio-cd-banner-url-text");
    if (cdBannerUrlText) cdBannerUrlText.value = path;
    const url = await urlImagem(path);
    if (defaultCdBanner) defaultCdBanner.style.display = "none";
    if (previewCdBanner) {
      previewCdBanner.style.display = "block";
      atualizarPreviewEstilo(previewCdBanner, url, fit);
    }
  } catch (err) {
    alert("Erro ao subir banner: " + err.message);
    if (textLabel) textLabel.textContent = "Erro ao subir imagem";
  }
});

document.getElementById("btn-remove-cd-banner")?.addEventListener("click", (e) => {
  e.stopPropagation(); // Evita acionar o seletor de arquivos!
  document.getElementById("studio-cd-banner-url").value = "";
  document.getElementById("studio-cd-banner-file").value = "";
  const cdBannerUrlText = document.getElementById("studio-cd-banner-url-text");
  if (cdBannerUrlText) cdBannerUrlText.value = "";
  document.getElementById("studio-cd-banner-fit").value = "cover";
  document.getElementById("studio-cd-banner-ratio").value = "2.5-1";
  const defaultCdBanner = document.getElementById("studio-cd-banner-default");
  const previewCdBanner = document.getElementById("studio-cd-banner-preview");
  const parent = previewCdBanner?.closest(".studio-upload-box");
  if (parent) {
    parent.style.removeProperty("aspect-ratio");
    parent.style.removeProperty("min-height");
  }
  if (defaultCdBanner) defaultCdBanner.style.display = "flex";
  if (previewCdBanner) {
    previewCdBanner.style.display = "none";
    previewCdBanner.style.backgroundImage = "";
  }
  const textLabel = document.getElementById("studio-cd-banner-text");
  if (textLabel) textLabel.textContent = "Clique para carregar banner...";
});

document.getElementById("studio-cd-banner-url-text")?.addEventListener("input", async (e) => {
  const val = e.target.value.trim();
  const fit = document.getElementById("studio-cd-banner-fit").value;
  const ratio = document.getElementById("studio-cd-banner-ratio").value;
  document.getElementById("studio-cd-banner-url").value = gerarUrlComHash(val, fit, ratio);
  const defaultCdBanner = document.getElementById("studio-cd-banner-default");
  const previewCdBanner = document.getElementById("studio-cd-banner-preview");
  
  if (val) {
    const url = await urlImagem(val);
    if (defaultCdBanner) defaultCdBanner.style.display = "none";
    if (previewCdBanner) {
      previewCdBanner.style.display = "block";
      atualizarPreviewEstilo(previewCdBanner, url, fit, ratio);
    }
  } else {
    if (defaultCdBanner) defaultCdBanner.style.display = "flex";
    if (previewCdBanner) {
      previewCdBanner.style.display = "none";
      previewCdBanner.style.backgroundImage = "";
    }
  }
});

document.getElementById("studio-cd-banner-fit")?.addEventListener("change", async (e) => {
  const fit = e.target.value;
  const ratio = document.getElementById("studio-cd-banner-ratio").value;
  const rawUrl = document.getElementById("studio-cd-banner-url-text").value.trim();
  if (rawUrl) {
    document.getElementById("studio-cd-banner-url").value = gerarUrlComHash(rawUrl, fit, ratio);
    const url = await urlImagem(rawUrl);
    const previewCdBanner = document.getElementById("studio-cd-banner-preview");
    atualizarPreviewEstilo(previewCdBanner, url, fit, ratio);
  }
});

// Bind de Alteração de Proporção/Tamanho de Banner da Campanha
document.getElementById("studio-cd-banner-ratio")?.addEventListener("change", async (e) => {
  const ratio = e.target.value;
  const fit = document.getElementById("studio-cd-banner-fit").value;
  const rawUrl = document.getElementById("studio-cd-banner-url-text").value.trim();
  if (rawUrl) {
    document.getElementById("studio-cd-banner-url").value = gerarUrlComHash(rawUrl, fit, ratio);
    const url = await urlImagem(rawUrl);
    const previewCdBanner = document.getElementById("studio-cd-banner-preview");
    atualizarPreviewEstilo(previewCdBanner, url, fit, ratio);
  }
});


formStudioCampanha?.addEventListener("submit", async (e) => {
  e.preventDefault();
  cdStudioAviso.textContent = "";
  cdStudioAviso.classList.remove("erro");

  const id = document.querySelector("#studio-cd-id").value || null;
  const payload = {
    nome: document.querySelector("#studio-cd-nome").value.trim(),
    descricao: document.querySelector("#studio-cd-descricao").value.trim() || null,
    banner_url: document.querySelector("#studio-cd-banner-url").value.trim() || null,
    xp_recompensa: parseInt(document.querySelector("#studio-cd-xp").value) || 0,
    pontos_recompensa: parseInt(document.querySelector("#studio-cd-pontos").value) || 0,
    cor_primaria: document.querySelector("#studio-cd-cor1").value,
    cor_secundaria: document.querySelector("#studio-cd-cor2").value,
    inicio: converterParaUtcIso(document.querySelector("#studio-cd-inicio").value),
    fim: converterParaUtcIso(document.querySelector("#studio-cd-fim").value),
    ativo: document.querySelector("#studio-cd-ativo").checked,
  };


  if (payload.ativo && id) {
    const { count } = await supabase
      .from("desafios")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", id)
      .eq("ativo", true);
    if ((count ?? 0) === 0) {
      mostrarConfirmacaoGenerica({
        emoji: "⚠️",
        cor: "#f59e0b",
        titulo: "Campanha ativa sem fases",
        mensagem: "Esta campanha está marcada como ativa, mas não há nenhuma fase ativa — os usuários verão uma campanha vazia. Publicar mesmo assim?",
        confirmar: "Publicar assim mesmo",
        cancelar: "Revisar"
      }, () => executarSalvarCampanha(payload, id));
      return;
    }
  }

  executarSalvarCampanha(payload, id);
});

async function executarSalvarCampanha(payload, id) {
  let res;
  if (id) {
    res = await supabase.from("campanhas_desafios").update(payload).eq("id", id).select("id, nome").single();
  } else {
    res = await supabase.from("campanhas_desafios").insert(payload).select("id, nome").single();
  }

  if (res.error) {
    cdStudioAviso.textContent = "Erro ao salvar: " + res.error.message;
    cdStudioAviso.classList.add("erro");
    return;
  }

  cdStudioAviso.textContent = "Configurações salvas!";

  if (!id && res.data) {
    // Transiciona automaticamente para o modo de edição com trilha desbloqueada!
    entrarStudio(res.data.id, res.data.nome);
  } else {
    carregarCampanhasDesafios();
  }
}



async function carregarFasesStudio(campId) {
  if (!fasesStudioLista) return;
  fasesStudioLista.innerHTML = '<p class="vazio" style="padding: 10px 0;">Carregando fases...</p>';

  const { data, error } = await supabase
    .from("desafios")
    .select("id, titulo, tipo, xp_recompensa, pontos_recompensa, ordem, imagem_url, ativo")
    .eq("campanha_id", campId)
    .order("ordem");

  if (error) {
    fasesStudioLista.innerHTML = '<p class="vazio">Erro ao carregar fases.</p>';
    return;
  }

  fasesCampanha = data || [];

  if (fasesCampanha.length === 0) {
    fasesStudioLista.innerHTML = '<p class="vazio" style="padding: 20px 0; font-size:12px;">Nenhuma fase adicionada. Crie a primeira abaixo!</p>';
    return;
  }

  if (fasesCampanha.length > 0 && !faseSelecionadaId) {
    faseSelecionadaId = fasesCampanha[0].id;
    setTimeout(() => {
      carregarEditorFase(faseSelecionadaId);
    }, 50);
  }

  fasesStudioLista.innerHTML = fasesCampanha
    .map((f, i) => {
      const isSelected = faseSelecionadaId === f.id;
      const xp = f.xp_recompensa > 0 ? f.xp_recompensa : parseInt(document.querySelector("#studio-cd-xp").value);
      const pts = f.pontos_recompensa > 0 ? f.pontos_recompensa : parseInt(document.querySelector("#studio-cd-pontos").value);

      const ehPrimeira = i === 0;
      const ehUltima = i === fasesCampanha.length - 1;

      return `
      <div class="fase-item-card ${isSelected ? 'selected' : ''}" data-fase-item="${f.id}">
        <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 4px;">
          <strong style="font-size: 13px;">${i + 1}. ${f.titulo}${f.ativo === false ? ' <span style="font-size: 9px; font-weight: 800; letter-spacing: 0.5px; color: var(--muted); background: var(--soft); border: 1px solid var(--border); padding: 1px 6px; border-radius: 6px; vertical-align: middle;">INATIVA</span>' : ''}</strong>
          <span style="font-size: 11px; color: var(--muted);">
            ${f.tipo} · <span class="studio-badge-xp">⚡ ${xp} XP</span> · <span class="studio-badge-crc"><img src="/assets/images/crcoins.webp" alt="CRC" style="width: 12px; height: 12px; object-fit: contain; vertical-align: middle; margin-right: 2px;" /> ${pts} CRC</span>
          </span>
        </div>
        <div style="display: flex; gap: 2px; flex-shrink: 0; align-items: center;" onclick="event.stopPropagation()">
          <button type="button" class="link" data-mover-fase="${f.id}" data-dir="-1" title="Mover para cima" ${ehPrimeira ? "disabled style='opacity:0.25; padding:4px; color: var(--muted);'" : "style='font-size: 11px; padding: 4px; color: var(--muted);'"}><i class="ph-fill ph-arrow-up" style="font-size:15px;"></i></button>
          <button type="button" class="link" data-mover-fase="${f.id}" data-dir="1" title="Mover para baixo" ${ehUltima ? "disabled style='opacity:0.25; padding:4px; color: var(--muted);'" : "style='font-size: 11px; padding: 4px; color: var(--muted);'"}><i class="ph-fill ph-arrow-down" style="font-size:15px;"></i></button>
          <button type="button" class="link" data-duplicar-fase="${f.id}" title="Duplicar esta fase (e todas as suas perguntas)" style="font-size: 11px; padding: 4px; color: var(--muted);"><i class="ph-fill ph-copy" style="font-size:16px;"></i></button>
          <button type="button" class="link btn-desativar" data-excluir-fase="${f.id}" title="Excluir fase" style="font-size: 11px; padding: 4px; color: var(--neg);"><i class="ph-fill ph-trash" style="font-size:16px;"></i></button>
        </div>
      </div>`;
    })
    .join("");

  fasesStudioLista.querySelectorAll("[data-fase-item]").forEach(card => {
    card.addEventListener("click", () => {
      const novoId = card.dataset.faseItem;
      if (novoId === faseSelecionadaId) return;
      guardarAlteracoes(() => {
        faseSelecionadaId = novoId;
        fasesStudioLista.querySelectorAll(".fase-item-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        carregarEditorFase(faseSelecionadaId);
      });
    });
  });

  fasesStudioLista.querySelectorAll("[data-mover-fase]").forEach(btn => {
    btn.addEventListener("click", () => moverFase(btn.dataset.moverFase, parseInt(btn.dataset.dir, 10)));
  });

  fasesStudioLista.querySelectorAll("[data-duplicar-fase]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      cdStudioAviso.textContent = "Duplicando fase… ⏳";
      await duplicarFaseCompleta(btn.dataset.duplicarFase);
      cdStudioAviso.textContent = "Fase duplicada com sucesso!";
      carregarFasesStudio(campId);
    });
  });

  fasesStudioLista.querySelectorAll("[data-excluir-fase]").forEach(btn => {
    btn.addEventListener("click", () => {
      mostrarConfirmacaoGenerica({
        emoji: "🗑️",
        cor: "#ef4444",
        titulo: "Excluir esta fase?",
        mensagem: "A fase e todas as suas perguntas e alternativas serão excluídas. Esta ação não pode ser desfeita.",
        confirmar: "Excluir"
      }, async () => {
        cdStudioAviso.textContent = "Excluindo fase…";
        const { error } = await supabase.from("desafios").delete().eq("id", btn.dataset.excluirFase);
        if (error) {
          cdStudioAviso.textContent = "Erro ao excluir: " + error.message;
        } else {
          cdStudioAviso.textContent = "Fase excluída com sucesso!";
          limparRascunho(btn.dataset.excluirFase);
          if (faseSelecionadaId === btn.dataset.excluirFase) {
            faseSelecionadaId = null;
            marcarStudioLimpo();
            faseEditorVazio.hidden = false;
            faseEditorAtivo.hidden = true;
          }
          carregarFasesStudio(campId);
        }
      });
    });
  });
}

async function moverFase(faseId, dir) {
  const i = fasesCampanha.findIndex(f => f.id === faseId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= fasesCampanha.length) return;

  const a = fasesCampanha[i];
  const b = fasesCampanha[j];
  cdStudioAviso.textContent = "Reordenando fases…";

  const r1 = await supabase.from("desafios").update({ ordem: b.ordem }).eq("id", a.id);
  const r2 = await supabase.from("desafios").update({ ordem: a.ordem }).eq("id", b.id);

  if (r1.error || r2.error) {
    cdStudioAviso.textContent = "Erro ao reordenar: " + (r1.error?.message || r2.error?.message);
    return;
  }
  cdStudioAviso.textContent = "";
  await carregarFasesStudio(campanhaAtualId);
}

btnStudioAddFase?.addEventListener("click", async () => {
  if (!campanhaAtualId) return;

  let maxOrdem = 0;
  if (fasesCampanha.length > 0) {
    maxOrdem = Math.max(...fasesCampanha.map(f => f.ordem || 0));
  }

  const payload = {
    campanha_id: campanhaAtualId,
    titulo: `Fase ${fasesCampanha.length + 1}`,
    descricao: "Nova fase criada no Studio.",
    tipo: "quiz",
    xp_recompensa: 0, 
    pontos_recompensa: 0,
    ordem: maxOrdem + 1,
    ativo: true
  };

  cdStudioAviso.textContent = "Adicionando nova fase…";
  const { data, error } = await supabase.from("desafios").insert(payload).select("id, titulo").single();

  if (error) {
    cdStudioAviso.textContent = "Erro ao adicionar fase: " + error.message;
    cdStudioAviso.classList.add("erro");
    return;
  }

  cdStudioAviso.textContent = "Nova fase criada!";
  faseSelecionadaId = data.id;
  await carregarFasesStudio(campanhaAtualId);
  carregarEditorFase(data.id);
});


async function carregarEditorFase(faseId) {
  if (faseEditorVazio) faseEditorVazio.hidden = true;
  if (faseEditorAtivo) faseEditorAtivo.hidden = false;

  const editorAviso = document.querySelector("#cd-studio-aviso");
  editorAviso.textContent = "Carregando fase…";

  const defaultFaseImg = document.getElementById("studio-fase-imagem-default");
  const previewFaseImg = document.getElementById("studio-fase-imagem-preview");
  if (defaultFaseImg) defaultFaseImg.style.display = "flex";
  if (previewFaseImg) {
    previewFaseImg.style.display = "none";
    previewFaseImg.style.backgroundImage = "";
  }
  document.getElementById("studio-fase-imagem-url").value = "";
  document.getElementById("studio-fase-imagem-file").value = "";
  const faseImgUrlText = document.getElementById("studio-fase-imagem-url-text");
  if (faseImgUrlText) faseImgUrlText.value = "";

  const { data: fase, error } = await supabase
    .from("desafios")
    .select("*")
    .eq("id", faseId)
    .maybeSingle();

  if (error || !fase) {
    editorAviso.textContent = "Erro ao carregar dados da fase.";
    editorAviso.classList.add("erro");
    return;
  }

  editorAviso.textContent = "";

  document.querySelector("#studio-fase-id").value = fase.id;
  document.querySelector("#studio-fase-titulo").value = fase.titulo;
  document.querySelector("#studio-fase-tipo").value = fase.tipo;
  document.querySelector("#studio-fase-descricao").value = fase.descricao || "";
  document.querySelector("#studio-fase-xp").value = fase.xp_recompensa;
  document.querySelector("#studio-fase-pontos").value = fase.pontos_recompensa;
  document.querySelector("#studio-fase-tempo").value = fase.tempo_segundos || "";
  document.querySelector("#studio-fase-tentativas").value = fase.max_tentativas || "";
  const elFaseAtivo = document.querySelector("#studio-fase-ativo");
  if (elFaseAtivo) elFaseAtivo.checked = fase.ativo !== false;

  if (fase.imagem_url) {
    const { url: cleanUrl, fit, ratio } = obterAjusteImagem(fase.imagem_url);
    document.getElementById("studio-fase-imagem-url").value = fase.imagem_url;
    if (faseImgUrlText) faseImgUrlText.value = cleanUrl;
    document.getElementById("studio-fase-imagem-fit").value = fit;
    document.getElementById("studio-fase-imagem-ratio").value = ratio;
    const url = await urlImagem(cleanUrl);
    if (defaultFaseImg) defaultFaseImg.style.display = "none";
    if (previewFaseImg) {
      previewFaseImg.style.display = "block";
      atualizarPreviewEstilo(previewFaseImg, url, fit, ratio);
    }
  } else {
    document.getElementById("studio-fase-imagem-fit").value = "cover";
    document.getElementById("studio-fase-imagem-ratio").value = "2.5-1";
    const parent = previewFaseImg?.closest(".studio-upload-box");
    if (parent) {
      parent.style.removeProperty("aspect-ratio");
      parent.style.removeProperty("min-height");
    }
    if (defaultFaseImg) defaultFaseImg.style.display = "flex";
    if (previewFaseImg) {
      previewFaseImg.style.display = "none";
      previewFaseImg.style.backgroundImage = "";
    }
  }

  await carregarPerguntasStudio(faseId);
  marcarStudioLimpo();


  oferecerRestauracaoRascunho(faseId);
}

document.querySelector("#studio-fase-imagem-file")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const defaultFaseImg = document.getElementById("studio-fase-imagem-default");
  const previewFaseImg = document.getElementById("studio-fase-imagem-preview");
  const textLabel = document.getElementById("studio-fase-imagem-text");
  if (!file) return;

  if (textLabel) textLabel.textContent = "Subindo imagem… ⏳";
  try {
    const path = await uploadImagem(file);
    const fit = document.getElementById("studio-fase-imagem-fit").value;
    const ratio = document.getElementById("studio-fase-imagem-ratio").value;
    document.getElementById("studio-fase-imagem-url").value = gerarUrlComHash(path, fit, ratio);
    const faseImgUrlText = document.getElementById("studio-fase-imagem-url-text");
    if (faseImgUrlText) faseImgUrlText.value = path;
    const url = await urlImagem(path);
    if (defaultFaseImg) defaultFaseImg.style.display = "none";
    if (previewFaseImg) {
      previewFaseImg.style.display = "block";
      atualizarPreviewEstilo(previewFaseImg, url, fit, ratio);
    }
  } catch (err) {
    alert("Erro ao subir imagem da fase: " + err.message);
    if (textLabel) textLabel.textContent = "Erro ao subir imagem";
  }
});

document.getElementById("btn-remove-fase-imagem")?.addEventListener("click", (e) => {
  e.stopPropagation(); // Evita acionar o seletor de arquivos!
  document.getElementById("studio-fase-imagem-url").value = "";
  document.getElementById("studio-fase-imagem-file").value = "";
  const faseImgUrlText = document.getElementById("studio-fase-imagem-url-text");
  if (faseImgUrlText) faseImgUrlText.value = "";
  document.getElementById("studio-fase-imagem-fit").value = "cover";
  document.getElementById("studio-fase-imagem-ratio").value = "2.5-1";
  const defaultFaseImg = document.getElementById("studio-fase-imagem-default");
  const previewFaseImg = document.getElementById("studio-fase-imagem-preview");
  const parent = previewFaseImg?.closest(".studio-upload-box");
  if (parent) {
    parent.style.removeProperty("aspect-ratio");
    parent.style.removeProperty("min-height");
  }
  if (defaultFaseImg) defaultFaseImg.style.display = "flex";
  if (previewFaseImg) {
    previewFaseImg.style.display = "none";
    previewFaseImg.style.backgroundImage = "";
  }
  const textLabel = document.getElementById("studio-fase-imagem-text");
  if (textLabel) textLabel.textContent = "Clique para carregar imagem da fase...";
});

document.getElementById("studio-fase-imagem-url-text")?.addEventListener("input", async (e) => {
  const val = e.target.value.trim();
  const fit = document.getElementById("studio-fase-imagem-fit").value;
  const ratio = document.getElementById("studio-fase-imagem-ratio").value;
  document.getElementById("studio-fase-imagem-url").value = gerarUrlComHash(val, fit, ratio);
  const defaultFaseImg = document.getElementById("studio-fase-imagem-default");
  const previewFaseImg = document.getElementById("studio-fase-imagem-preview");
  
  if (val) {
    const url = await urlImagem(val);
    if (defaultFaseImg) defaultFaseImg.style.display = "none";
    if (previewFaseImg) {
      previewFaseImg.style.display = "block";
      atualizarPreviewEstilo(previewFaseImg, url, fit, ratio);
    }
  } else {
    if (defaultFaseImg) defaultFaseImg.style.display = "flex";
    if (previewFaseImg) {
      previewFaseImg.style.display = "none";
      previewFaseImg.style.backgroundImage = "";
    }
  }
});

document.getElementById("studio-fase-imagem-fit")?.addEventListener("change", async (e) => {
  const fit = e.target.value;
  const ratio = document.getElementById("studio-fase-imagem-ratio").value;
  const rawUrl = document.getElementById("studio-fase-imagem-url-text").value.trim();
  if (rawUrl) {
    document.getElementById("studio-fase-imagem-url").value = gerarUrlComHash(rawUrl, fit, ratio);
    const url = await urlImagem(rawUrl);
    const previewFaseImg = document.getElementById("studio-fase-imagem-preview");
    atualizarPreviewEstilo(previewFaseImg, url, fit, ratio);
  }
});

document.getElementById("studio-fase-imagem-ratio")?.addEventListener("change", async (e) => {
  const ratio = e.target.value;
  const fit = document.getElementById("studio-fase-imagem-fit").value;
  const rawUrl = document.getElementById("studio-fase-imagem-url-text").value.trim();
  if (rawUrl) {
    document.getElementById("studio-fase-imagem-url").value = gerarUrlComHash(rawUrl, fit, ratio);
    const url = await urlImagem(rawUrl);
    const previewFaseImg = document.getElementById("studio-fase-imagem-preview");
    atualizarPreviewEstilo(previewFaseImg, url, fit, ratio);
  }
});



async function salvarAjustesFase(silencioso = false) {
  const editorAviso = document.querySelector("#cd-studio-aviso");
  if (!silencioso) {
    editorAviso.textContent = "Salvando fase…";
    editorAviso.classList.remove("erro");
  }

  const id = document.querySelector("#studio-fase-id").value;
  const tempo = document.querySelector("#studio-fase-tempo").value;
  const tentativas = document.querySelector("#studio-fase-tentativas").value;

  const payload = {
    titulo: document.querySelector("#studio-fase-titulo").value.trim(),
    tipo: document.querySelector("#studio-fase-tipo").value,
    descricao: document.querySelector("#studio-fase-descricao").value.trim() || null,
    imagem_url: document.querySelector("#studio-fase-imagem-url").value.trim() || null,
    xp_recompensa: parseInt(document.querySelector("#studio-fase-xp").value) || 0,
    pontos_recompensa: parseInt(document.querySelector("#studio-fase-pontos").value) || 0,
    tempo_segundos: tempo ? parseInt(tempo, 10) : null,
    max_tentativas: tentativas ? parseInt(tentativas, 10) : null,
    ativo: document.querySelector("#studio-fase-ativo")?.checked ?? true
  };

  const { error } = await supabase.from("desafios").update(payload).eq("id", id);

  if (error) {
    if (!silencioso) {
      editorAviso.textContent = "Erro ao salvar fase: " + error.message;
      editorAviso.classList.add("erro");
    }
    return false;
  }

  if (!silencioso) {
    editorAviso.textContent = "Ajustes da fase salvos!";
    carregarFasesStudio(campanhaAtualId);
  }
  return true;
}


async function carregarPerguntasStudio(faseId, expandedId = null, usarModelo = false) {
  if (!perguntasStudioLista) return;

  if (!usarModelo) {
    perguntasStudioLista.innerHTML = '<p class="vazio" style="padding: 20px 0;">Carregando perguntas e fluxo…</p>';

    const { data: perguntas, error: errP } = await supabase
      .from("desafio_perguntas")
      .select("id, texto, ordem, imagem_url")
      .eq("desafio_id", faseId)
      .order("ordem");

    if (errP) {
      perguntasStudioLista.innerHTML = '<p class="vazio">Erro ao carregar perguntas.</p>';
      return;
    }

    const lista = perguntas || [];

    let altMap = {};
    if (lista.length > 0) {
      const { data: alternativas } = await supabase
        .from("desafio_alternativas")
        .select("id, pergunta_id, texto, correta, ordem, proxima_pergunta_id")
        .in("pergunta_id", lista.map(q => q.id))
        .order("ordem");
      (alternativas || []).forEach(a => {
        if (!altMap[a.pergunta_id]) altMap[a.pergunta_id] = [];
        altMap[a.pergunta_id].push(a);
      });
    }

    perguntasModel = lista.map(q => ({
      id: q.id,
      texto: (q.texto && q.texto !== "Nova pergunta em branco...") ? q.texto : "",
      imagem_url: q.imagem_url || "",
      alts: (altMap[q.id] || []).map(a => ({
        texto: a.texto || "",
        correta: !!a.correta,
        proxima_pergunta_id: a.proxima_pergunta_id || ""
      }))
    }));
    perguntasFase = perguntasModel; 
  }

  if (perguntasModel.length === 0) {
    perguntasStudioLista.innerHTML = `
      <div class="studio-empty-state" style="padding: 30px 20px;">
        <i class="ph-fill ph-plus-circle" style="font-size: 32px; margin-bottom: 8px;"></i>
        <h3 style="font-size: 14px; font-weight: 700;">Nenhuma pergunta nesta fase</h3>
        <p style="font-size:12px;">Adicione a primeira pergunta clicando no botão abaixo para começar a desenhar seu quiz!</p>
      </div>`;
    return;
  }

  const imgUrls = await Promise.all(
    perguntasModel.map(q => q.imagem_url ? urlImagem(q.imagem_url) : Promise.resolve(""))
  );

  perguntasStudioLista.innerHTML = perguntasModel
    .map((q, idx) => {
      const alts = q.alts || [];
      const imgPreviewUrl = imgUrls[idx];
      
      const isCollapsed = expandedId ? (q.id !== expandedId) : (idx !== 0);
      const collapsedClass = isCollapsed ? 'collapsed' : '';
      const caretDir = isCollapsed ? 'down' : 'up';
      const cleanText = q.texto && q.texto !== "Nova pergunta em branco..." ? q.texto : "";

      const ehPrimeira = idx === 0;
      const ehUltima = idx === perguntasModel.length - 1;

      return `
      <div class="pergunta-item-card ${collapsedClass}" id="q-card-${q.id}" data-qid="${q.id}">
        <!-- Cabeçalho Retrátil (Click para expandir/recolher) -->
        <div class="pergunta-card-head" data-toggle-card="${q.id}">
          <span style="display: flex; align-items: center; gap: 8px;">
            <i class="ph-fill ph-caret-${caretDir}" style="color: var(--muted); font-size: 16px;"></i>
            <span>Pergunta ${idx + 1}: <span style="font-weight: 500; color: var(--muted); font-size: 12px; font-style: italic;">${q.texto && q.texto.length > 40 ? q.texto.substring(0, 40) + '...' : (q.texto || 'Pergunta em branco')}</span></span>
          </span>
          <div style="display: flex; gap: 4px; align-items: center;" onclick="event.stopPropagation()">
            <button type="button" class="link" data-mover-pergunta="${q.id}" data-dir="-1" title="Mover para cima" ${ehPrimeira ? "disabled style='opacity:0.25; color: var(--muted); padding:2px;'" : "style='color: var(--muted); padding:2px;'"}><i class="ph-fill ph-arrow-up"></i></button>
            <button type="button" class="link" data-mover-pergunta="${q.id}" data-dir="1" title="Mover para baixo" ${ehUltima ? "disabled style='opacity:0.25; color: var(--muted); padding:2px;'" : "style='color: var(--muted); padding:2px;'"}><i class="ph-fill ph-arrow-down"></i></button>
            <button type="button" class="link" data-excluir-pergunta="${q.id}" style="color: var(--neg); font-size: 11px; font-weight: 700; margin-left: 4px;">✕ Excluir</button>
          </div>
        </div>

        <!-- Corpo da Pergunta (Ocultado quando recolhido) -->
        <div class="pergunta-card-body-content" style="display: flex; flex-direction: column; gap: 14px; margin-top: 6px;">
          <div class="field">
            <label>Texto da Pergunta</label>
            <input type="text" class="q-texto-input" placeholder="Ex: Qual o valor mínimo para resgatar na loja?" value="${cleanText}" style="font-weight: 600;" />
          </div>

          <!-- Upload de Imagem da Pergunta -->
          <div class="field">
            <label>Imagem Ilustrativa da Pergunta (Opcional)</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="text" id="q-img-url-${q.id}" class="q-img-url-input" placeholder="Cole a URL da imagem ou faça upload..." value="${q.imagem_url || ''}" style="flex: 1; padding: 10px 12px; font-size: 13px;" />
              <button type="button" class="btn-upload-q-file" data-qid="${q.id}" title="Fazer Upload" style="padding: 0; border-radius: 8px; background: var(--soft); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; cursor: pointer; color: var(--ink); flex-shrink: 0; transition: background 0.2s;">
                <i class="ph-fill ph-upload-simple" style="font-size: 16px;"></i>
              </button>
              <input type="file" id="q-img-file-${q.id}" class="q-img-file-input" data-qid="${q.id}" accept="image/*" style="display: none;" />
            </div>
            
            <!-- Preview da Imagem -->
            <div id="q-img-preview-box-${q.id}" style="margin-top: 8px; height: 80px; border-radius: 8px; border: 1px solid var(--border); background: var(--canvas); overflow: hidden; display: ${q.imagem_url ? 'block' : 'none'}; position: relative;">
              <div id="q-img-preview-img-${q.id}" style="height: 100%; background: url('${imgPreviewUrl || ''}') no-repeat center/contain;"></div>
              <button type="button" class="btn-remove-q-image" data-qid="${q.id}" title="Remover Imagem" style="position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; background: rgba(220, 38, 38, 0.9); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: background 0.2s; z-index: 10;">✕</button>
            </div>
          </div>

          <!-- Lista de Alternativas -->
          <div style="margin-top: 8px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 6px;">Alternativas & Fluxo das Respostas</label>
            <div class="alts-rows-container" style="display: flex; flex-direction: column; gap: 8px;">
              ${alts
                .map(
                  (a, aIdx) => `
                <div class="alt-row" style="display: flex; gap: 8px; align-items: center;" data-alt-id="${a.id}">
                  <label style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 9999px; background: var(--soft); font-size: 10px; font-weight: 700; cursor: pointer; flex-shrink:0;">
                    <input type="radio" name="correct-radio-${q.id}" class="alt-correct-radio" ${a.correta ? "checked" : ""} style="display: none;" />
                    <span class="correct-indicator" style="display: flex; align-items: center; justify-content: center; width:100%; height:100%; border-radius:9999px; border:1px solid var(--border); transition: background 0.18s; font-size: 9px;">${LETRAS[aIdx] || aIdx + 1}</span>
                  </label>

                  <input type="text" class="alt-text-input" placeholder="Texto da alternativa" value="${a.texto}" style="flex: 2; padding: 8px 12px; font-size: 13px;" />

                  <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <span style="font-size: 10px; color: var(--muted);">Ir para:</span>
                    <select class="alt-next-select" style="font-size: 11px; padding: 6px; border-radius: 8px; border: 1px solid var(--border); background: var(--soft); max-width: 130px;">
                      <option value="">Linear (próxima)</option>
                      ${perguntasFase
                        .filter(otherQ => otherQ.id !== q.id)
                        .map(otherQ => `<option value="${otherQ.id}" ${a.proxima_pergunta_id === otherQ.id ? "selected" : ""}>Q: "${(otherQ.texto || "").substring(0, 16)}..."</option>`)
                        .join("")}
                    </select>
                  </div>

                  <button type="button" class="link btn-remove-alt" style="color: var(--neg); font-size: 14px; padding: 4px;">✕</button>
                </div>`
                )
                .join("")}
            </div>
            <button type="button" class="link btn-add-alt-studio" data-qid="${q.id}" style="font-size: 11px; font-weight: 700; color: #6366f1; margin-top: 6px; display: inline-block;">＋ Adicionar Alternativa</button>
          </div>

        </div>
      </div>`;
    })
    .join("");

  perguntasStudioLista.querySelectorAll("[data-toggle-card]").forEach(header => {
    header.addEventListener("click", () => {
      const card = header.closest(".pergunta-item-card");
      const isCollapsed = card.classList.toggle("collapsed");
      
      const icon = header.querySelector(".ph-caret-down, .ph-caret-up");
      if (icon) {
        icon.className = isCollapsed ? "ph-fill ph-caret-down" : "ph-fill ph-caret-up";
      }
    });
  });

  perguntasStudioLista.querySelectorAll(".pergunta-item-card").forEach(card => {
    const updateIndicators = () => {
      card.querySelectorAll(".alt-row").forEach(row => {
        const checked = row.querySelector(".alt-correct-radio").checked;
        const ind = row.querySelector(".correct-indicator");
        if (checked) {
          ind.style.background = "var(--pos)";
          ind.style.borderColor = "var(--pos)";
          ind.style.color = "#fff";
          ind.style.fontWeight = "700";
        } else {
          ind.style.background = "var(--soft)";
          ind.style.borderColor = "var(--border)";
          ind.style.color = "var(--muted)";
          ind.style.fontWeight = "400";
        }
      });
    };

    card.querySelectorAll(".alt-correct-radio").forEach(radio => {
      radio.addEventListener("change", updateIndicators);
    });

    updateIndicators();
  });

  perguntasStudioLista.querySelectorAll(".btn-remove-alt").forEach(btn => {
    btn.addEventListener("click", () => {
      const container = btn.closest(".alts-rows-container");
      if (container.children.length <= 2) {
        alert("Uma pergunta deve ter no mínimo duas alternativas.");
        return;
      }
      btn.closest(".alt-row").remove();
    });
  });

  perguntasStudioLista.querySelectorAll(".btn-add-alt-studio").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.dataset.qid;
      const container = btn.previousElementSibling;
      const idx = container.children.length;
      
      const div = document.createElement("div");
      div.className = "alt-row";
      div.style.cssText = "display: flex; gap: 8px; align-items: center; margin-bottom: 4px;";
      
      const optionsHtml = perguntasFase
        .filter(otherQ => otherQ.id !== qid)
        .map(otherQ => `<option value="${otherQ.id}">Q: "${(otherQ.texto || "").substring(0, 16)}..."</option>`)
        .join("");

      div.innerHTML = `
        <label style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 9999px; background: var(--soft); font-size: 10px; font-weight: 700; cursor: pointer; flex-shrink:0;">
          <input type="radio" name="correct-radio-${qid}" class="alt-correct-radio" style="display: none;" />
          <span class="correct-indicator" style="display: flex; align-items: center; justify-content: center; width:100%; height:100%; border-radius:9999px; border:1px solid var(--border); transition: background 0.18s; font-size: 9px; color: var(--muted);">${LETRAS[idx] || idx + 1}</span>
        </label>
        <input type="text" class="alt-text-input" placeholder="Texto da alternativa" style="flex: 2; padding: 8px 12px; font-size: 13px;" />
        <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
          <span style="font-size: 10px; color: var(--muted);">Ir para:</span>
          <select class="alt-next-select" style="font-size: 11px; padding: 6px; border-radius: 8px; border: 1px solid var(--border); background: var(--soft); max-width: 130px;">
            <option value="">Linear (próxima)</option>
            ${optionsHtml}
          </select>
        </div>
        <button type="button" class="link btn-remove-alt" style="color: var(--neg); font-size: 14px; padding: 4px;">✕</button>
      `;

      div.querySelector(".btn-remove-alt").addEventListener("click", () => {
        if (container.children.length <= 2) {
          alert("Uma pergunta deve ter no mínimo duas alternativas.");
          return;
        }
        div.remove();
      });

      const radio = div.querySelector(".alt-correct-radio");
      radio.addEventListener("change", () => {
        container.querySelectorAll(".alt-row").forEach(row => {
          const checked = row.querySelector(".alt-correct-radio").checked;
          const ind = row.querySelector(".correct-indicator");
          if (checked) {
            ind.style.background = "var(--pos)";
            ind.style.borderColor = "var(--pos)";
            ind.style.color = "#fff";
            ind.style.fontWeight = "700";
          } else {
            ind.style.background = "var(--soft)";
            ind.style.borderColor = "var(--border)";
            ind.style.color = "var(--muted)";
            ind.style.fontWeight = "400";
          }
        });
      });

      container.appendChild(div);
    });
  });

  perguntasStudioLista.querySelectorAll(".btn-upload-q-file").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.dataset.qid;
      document.getElementById(`q-img-file-${qid}`).click();
    });
  });

  perguntasStudioLista.querySelectorAll(".q-img-file-input").forEach(input => {
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      const qid = input.dataset.qid;
      const urlInput = document.getElementById(`q-img-url-${qid}`);
      const previewBox = document.getElementById(`q-img-preview-box-${qid}`);
      const previewImg = document.getElementById(`q-img-preview-img-${qid}`);
      if (!file) return;

      urlInput.value = "Subindo… ⏳";
      try {
        const path = await uploadImagem(file);
        urlInput.value = path;
        const url = await urlImagem(path);
        if (previewImg) previewImg.style.backgroundImage = `url('${url}')`;
        if (previewBox) previewBox.style.display = "block";
      } catch (err) {
        alert("Erro ao subir imagem: " + err.message);
        urlInput.value = "";
      }
    });
  });

  perguntasStudioLista.querySelectorAll(".q-img-url-input").forEach(input => {
    input.addEventListener("input", async (e) => {
      const qid = input.id.replace("q-img-url-", "");
      const url = e.target.value.trim();
      const previewBox = document.getElementById(`q-img-preview-box-${qid}`);
      const previewImg = document.getElementById(`q-img-preview-img-${qid}`);
      
      if (url) {
        const publicUrl = await urlImagem(url);
        if (previewImg) previewImg.style.backgroundImage = `url('${publicUrl}')`;
        if (previewBox) previewBox.style.display = "block";
      } else {
        if (previewBox) previewBox.style.display = "none";
      }
    });
  });

  perguntasStudioLista.querySelectorAll(".btn-remove-q-image").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const qid = btn.dataset.qid;
      document.getElementById(`q-img-url-${qid}`).value = "";
      document.getElementById(`q-img-file-${qid}`).value = "";
      
      const previewBox = document.getElementById(`q-img-preview-box-${qid}`);
      const previewImg = document.getElementById(`q-img-preview-img-${qid}`);
      if (previewBox) previewBox.style.display = "none";
      if (previewImg) previewImg.style.backgroundImage = "";
    });
  });

function mostrarConfirmacaoExcluirPergunta(onConfirm) {
  const modal = document.createElement("div");
  modal.className = "modal-bg";
  modal.style.zIndex = "99999";
  
  modal.innerHTML = `
    <div class="modal modal-anuncio-animated" style="max-width: 400px; --theme-color: #ef4444; animation: modalEntrada 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;">
      <div class="modal-inner" style="text-align: center; padding: 28px 24px;">
        <div style="font-size: 40px; margin-bottom: 16px;">🗑️</div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--ink); margin: 0 0 12px 0;">Excluir Pergunta?</h2>
        <p style="font-size: 13.5px; line-height: 1.6; color: var(--muted); margin: 0 0 24px 0;">
          Tem certeza de que deseja excluir esta pergunta e todas as suas alternativas?<br><br>
          Esta ação não pode ser desfeita.
        </p>
        <div style="display: flex; gap: 12px; width: 100%;">
          <button id="btn-confirmar-excluir-cancelar" style="flex: 1; padding: 12px; border-radius: 12px; background: var(--canvas); color: var(--muted); border: 1px solid var(--border); font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.2s;">
            Cancelar
          </button>
          <button id="btn-confirmar-excluir-sim" style="flex: 1; padding: 12px; border-radius: 12px; background: var(--theme-color); color: white; border: none; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.2s;">
            Excluir
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
  
  modal.querySelector("#btn-confirmar-excluir-cancelar").addEventListener("click", fechar);
  modal.querySelector("#btn-confirmar-excluir-sim").addEventListener("click", () => {
    fechar();
    onConfirm();
  });
}

  perguntasStudioLista.querySelectorAll("[data-excluir-pergunta]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation(); // Impede o toggle do card ao clicar no botão de excluir
      
      const qid = btn.dataset.excluirPergunta;
      mostrarConfirmacaoGenerica({
        emoji: "🗑️",
        cor: "#ef4444",
        titulo: "Excluir esta pergunta?",
        mensagem: "A pergunta e suas alternativas serão removidas. A exclusão só é gravada quando você clicar em \"Salvar Fase\".",
        confirmar: "Excluir"
      }, () => {
        sincronizarModelComDOM();
        perguntasModel = perguntasModel.filter(q => q.id !== qid);
        perguntasModel.forEach(p => p.alts.forEach(a => { if (a.proxima_pergunta_id === qid) a.proxima_pergunta_id = ""; }));
        perguntasFase = perguntasModel;
        marcarStudioSujo();
        agendarRascunho();
        carregarPerguntasStudio(faseSelecionadaId, null, true);
        const aviso = document.querySelector("#studio-perguntas-aviso");
        aviso.textContent = "Pergunta removida. Clique em \"Salvar Fase\" para gravar.";
        aviso.classList.remove("erro");
      });
    });
  });

  perguntasStudioLista.querySelectorAll("[data-mover-pergunta]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      moverPergunta(btn.dataset.moverPergunta, parseInt(btn.dataset.dir, 10));
    });
  });

  perguntasStudioLista.querySelectorAll("[data-salvar-pergunta]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const qid = btn.dataset.salvarPergunta;
      const card = document.getElementById(`q-card-${qid}`);
      const aviso = document.querySelector("#studio-perguntas-aviso");
      
      aviso.textContent = "Salvando pergunta…";
      aviso.classList.remove("erro");
      btn.disabled = true;

      const texto = card.querySelector(".q-texto-input").value.trim();
      const imagem_url = card.querySelector(".q-img-url-input").value.trim() || null;

      if (!texto) {
        aviso.textContent = "O texto da pergunta é obrigatório.";
        aviso.classList.add("erro");
        btn.disabled = false;
        return;
      }

      const alts = [];
      const altRows = card.querySelectorAll(".alt-row");
      altRows.forEach((row, i) => {
        const t = row.querySelector(".alt-text-input").value.trim();
        const c = row.querySelector(".alt-correct-radio").checked;
        const n = row.querySelector(".alt-next-select").value || null;
        if (t) alts.push({ texto: t, correta: c, ordem: i + 1, proxima_pergunta_id: n });
      });

      if (alts.length < 2) {
        aviso.textContent = "Uma pergunta deve possuir no mínimo duas alternativas válidas.";
        aviso.classList.add("erro");
        btn.disabled = false;
        return;
      }

      if (!alts.some(a => a.correta)) {
        aviso.textContent = "Selecione uma alternativa como a correta (clique no botão da letra).";
        aviso.classList.add("erro");
        btn.disabled = false;
        return;
      }

      try {

        const { error: errQ } = await supabase
          .from("desafio_perguntas")
          .update({ texto, imagem_url })
          .eq("id", qid);
        
        if (errQ) throw errQ;

        const { error: errDel } = await supabase
          .from("desafio_alternativas")
          .delete()
          .eq("pergunta_id", qid);
        
        if (errDel) throw errDel;

        const altsPayload = alts.map(a => ({
          pergunta_id: qid,
          texto: a.texto,
          correta: a.correta,
          ordem: a.ordem,
          proxima_pergunta_id: a.proxima_pergunta_id
        }));

        const { error: errIns } = await supabase
          .from("desafio_alternativas")
          .insert(altsPayload);
        
        if (errIns) throw errIns;

        const cardTitle = card.querySelector(".pergunta-card-head span span");
        if (cardTitle) {
          cardTitle.innerHTML = `Pergunta ${perguntasFase.findIndex(p => p.id === qid) + 1}: <span style="font-weight: 500; color: var(--muted); font-size: 12px; font-style: italic;">${texto.length > 40 ? texto.substring(0, 40) + '...' : texto}</span>`;
        }

        aviso.textContent = "Pergunta salva com sucesso! ✓";
        aviso.classList.remove("erro");

        const idxSaved = perguntasFase.findIndex(p => p.id === qid);
        const nextQ = (idxSaved !== -1 && idxSaved < perguntasFase.length - 1) ? perguntasFase[idxSaved + 1] : null;
        
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="ph-fill ph-check-circle" style="margin-right: 6px; vertical-align: middle;"></i> Salvo!`;
        btn.style.background = "var(--pos)";
        btn.style.borderColor = "var(--pos)";
        btn.style.color = "white";
        
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = "";
          btn.style.borderColor = "";
          btn.style.color = "";
        }, 1500);

        if (nextQ) {
          setTimeout(() => {
            const nextCard = document.getElementById(`q-card-${nextQ.id}`);
            if (nextCard) {
              card.classList.add("collapsed");
              nextCard.classList.remove("collapsed");
              nextCard.scrollIntoView({ behavior: "smooth", block: "center" });
              nextCard.style.outline = "2px solid var(--yellow)";
              setTimeout(() => nextCard.style.outline = "none", 1500);
            }
          }, 800);
        }
      } catch (err) {
        aviso.textContent = "Erro ao salvar: " + err.message;
        aviso.classList.add("erro");
      } finally {
        btn.disabled = false;
      }
    });
  });
}


function adicionarNovaPerguntaStudio() {
  if (!faseSelecionadaId) return;
  sincronizarModelComDOM();

  const tipo = document.querySelector("#studio-fase-tipo")?.value;
  const id = `tmp-${Date.now()}-${tmpSeq++}`;

  const alts = (tipo === "verdadeiro_falso")
    ? [
        { texto: "Verdadeiro", correta: true, proxima_pergunta_id: "" },
        { texto: "Falso", correta: false, proxima_pergunta_id: "" },
      ]
    : [
        { texto: "", correta: true, proxima_pergunta_id: "" },
        { texto: "", correta: false, proxima_pergunta_id: "" },
      ];

  perguntasModel.push({ id, texto: "", imagem_url: "", alts });
  perguntasFase = perguntasModel;
  marcarStudioSujo();
  agendarRascunho();

  const aviso = document.querySelector("#studio-perguntas-aviso");
  aviso.textContent = 'Pergunta adicionada! Preencha e clique em "Salvar Fase".';
  aviso.classList.remove("erro");

  carregarPerguntasStudio(faseSelecionadaId, id, true).then(() => {
    setTimeout(() => {
      const novo = document.getElementById(`q-card-${id}`);
      if (novo) {
        novo.scrollIntoView({ behavior: "smooth", block: "center" });
        novo.style.outline = "2px solid var(--yellow)";
        setTimeout(() => novo.style.outline = "none", 1800);
      }
    }, 60);
  });
}

btnStudioAddPergunta?.addEventListener("click", adicionarNovaPerguntaStudio);
btnStudioAddPerguntaFim?.addEventListener("click", adicionarNovaPerguntaStudio);


function sincronizarModelComDOM() {
  if (!perguntasStudioLista) return;
  const cards = perguntasStudioLista.querySelectorAll(".pergunta-item-card");
  if (cards.length === 0) return; 
  perguntasModel = Array.from(cards).map(card => ({
    id: card.dataset.qid,
    texto: card.querySelector(".q-texto-input")?.value || "",
    imagem_url: (card.querySelector(".q-img-url-input")?.value || "").trim(),
    alts: Array.from(card.querySelectorAll(".alt-row")).map(row => ({
      texto: row.querySelector(".alt-text-input")?.value || "",
      correta: !!row.querySelector(".alt-correct-radio")?.checked,
      proxima_pergunta_id: row.querySelector(".alt-next-select")?.value || ""
    }))
  }));
  perguntasFase = perguntasModel;
}

function marcarStudioSujo() { studioSujo = true; }
function marcarStudioLimpo() { studioSujo = false; }

function guardarAlteracoes(onConfirm) {
  if (!studioSujo) { onConfirm(); return; }
  mostrarConfirmacaoGenerica({
    emoji: "⚠️",
    cor: "#f59e0b",
    titulo: "Alterações não salvas",
    mensagem: "Há mudanças nesta fase que ainda não foram salvas no servidor (um rascunho local foi guardado). Deseja sair mesmo assim?",
    confirmar: "Sair sem salvar",
    cancelar: "Continuar editando"
  }, onConfirm);
}

function moverPergunta(qid, dir) {
  sincronizarModelComDOM();
  const i = perguntasModel.findIndex(q => q.id === qid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= perguntasModel.length) return;
  [perguntasModel[i], perguntasModel[j]] = [perguntasModel[j], perguntasModel[i]];
  perguntasFase = perguntasModel;
  marcarStudioSujo();
  agendarRascunho();
  carregarPerguntasStudio(faseSelecionadaId, qid, true);
}


async function salvarFaseCompleta() {
  if (!faseSelecionadaId) return;
  sincronizarModelComDOM();

  const aviso = document.querySelector("#studio-perguntas-aviso");
  aviso.classList.remove("erro");

  if (!document.querySelector("#studio-fase-titulo").value.trim()) {
    aviso.textContent = "Dê um título para a fase antes de salvar.";
    aviso.classList.add("erro");
    return;
  }
  if ((document.querySelector("#studio-fase-ativo")?.checked ?? true) && perguntasModel.length === 0) {
    aviso.textContent = 'Uma fase ativa precisa de pelo menos 1 pergunta. Adicione perguntas ou desmarque "Fase ativa".';
    aviso.classList.add("erro");
    return;
  }
  for (let i = 0; i < perguntasModel.length; i++) {
    const q = perguntasModel[i];
    if (!q.texto.trim()) return falharValidacao(`Pergunta ${i + 1}: escreva o texto da pergunta.`, q.id);
    const validas = q.alts.filter(a => a.texto.trim());
    if (validas.length < 2) return falharValidacao(`Pergunta ${i + 1}: preencha no mínimo 2 alternativas.`, q.id);
    if (!validas.some(a => a.correta)) return falharValidacao(`Pergunta ${i + 1}: marque a alternativa correta (clique na letra).`, q.id);
  }
  const erroFluxo = validarFluxoPerguntas();
  if (erroFluxo) {
    aviso.textContent = "⚠️ " + erroFluxo;
    aviso.classList.add("erro");
    return;
  }

  const saveButtons = document.querySelectorAll("#btn-studio-save-all, #btn-studio-save-all-fim, #btn-salvar-ajustes-fase-topo");
  saveButtons.forEach(b => b.disabled = true);
  aviso.textContent = "Salvando fase… ⏳";

  try {
    // 2. Ajustes da fase
    const ok = await salvarAjustesFase(true);
    if (!ok) throw new Error("não foi possível salvar os ajustes da fase.");

    // 3. Exclui do banco as perguntas que saíram do modelo
    const idsReais = perguntasModel.filter(q => !String(q.id).startsWith("tmp-")).map(q => q.id);
    const { data: atuais } = await supabase
      .from("desafio_perguntas").select("id").eq("desafio_id", faseSelecionadaId);
    const aExcluir = (atuais || []).map(r => r.id).filter(id => !idsReais.includes(id));
    if (aExcluir.length > 0) {
      const { error } = await supabase.from("desafio_perguntas").delete().in("id", aExcluir);
      if (error) throw error;
    }

    const idMap = {};
    for (let i = 0; i < perguntasModel.length; i++) {
      const q = perguntasModel[i];
      const dados = { texto: q.texto.trim(), imagem_url: q.imagem_url || null, ordem: i + 1 };
      if (String(q.id).startsWith("tmp-")) {
        const { data: novo, error } = await supabase
          .from("desafio_perguntas").insert({ desafio_id: faseSelecionadaId, ...dados })
          .select("id").single();
        if (error) throw error;
        idMap[q.id] = novo.id;
      } else {
        const { error } = await supabase.from("desafio_perguntas").update(dados).eq("id", q.id);
        if (error) throw error;
        idMap[q.id] = q.id;
      }
    }

    for (const q of perguntasModel) {
      const realId = idMap[q.id];
      await supabase.from("desafio_alternativas").delete().eq("pergunta_id", realId);
      const payload = q.alts.filter(a => a.texto.trim()).map((a, idx) => ({
        pergunta_id: realId,
        texto: a.texto.trim(),
        correta: !!a.correta,
        ordem: idx + 1,
        proxima_pergunta_id: a.proxima_pergunta_id ? (idMap[a.proxima_pergunta_id] || null) : null
      }));
      const { error } = await supabase.from("desafio_alternativas").insert(payload);
      if (error) throw error;
    }

    limparRascunho(faseSelecionadaId);
    marcarStudioLimpo();
    aviso.textContent = "Fase salva com sucesso! ✓";
    aviso.classList.remove("erro");
    document.querySelector("#cd-studio-aviso").textContent = "";
    await carregarFasesStudio(campanhaAtualId);
    await carregarPerguntasStudio(faseSelecionadaId);
  } catch (err) {
    console.error("Erro ao salvar fase:", err);
    aviso.textContent = "Erro ao salvar: " + err.message;
    aviso.classList.add("erro");
  } finally {
    saveButtons.forEach(b => b.disabled = false);
  }
}

function falharValidacao(msg, qid) {
  const aviso = document.querySelector("#studio-perguntas-aviso");
  aviso.textContent = msg;
  aviso.classList.add("erro");
  const card = document.getElementById(`q-card-${qid}`);
  if (card) {
    card.classList.remove("collapsed");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Detecta loop no fluxo "Ir para" (DFS a partir da 1ª pergunta sobre todos os ramos).
function validarFluxoPerguntas() {
  if (perguntasModel.length === 0) return null;
  const idToIdx = new Map(perguntasModel.map((q, i) => [q.id, i]));

  const proximos = (q, i) => {
    const destinos = new Set();
    let temLinear = false;
    q.alts.filter(a => a.texto.trim()).forEach(a => {
      if (a.proxima_pergunta_id && idToIdx.has(a.proxima_pergunta_id)) destinos.add(a.proxima_pergunta_id);
      else temLinear = true;
    });
    if (temLinear && i < perguntasModel.length - 1) destinos.add(perguntasModel[i + 1].id);
    return [...destinos];
  };

  const cor = {}; 
  let loopEm = null;
  const dfs = (id) => {
    cor[id] = 1;
    const i = idToIdx.get(id);
    for (const nxt of proximos(perguntasModel[i], i)) {
      if (cor[nxt] === 1) { loopEm = nxt; return true; }
      if (!cor[nxt] && dfs(nxt)) return true;
    }
    cor[id] = 2;
    return false;
  };

  if (dfs(perguntasModel[0].id) && loopEm != null) {
    const idx = idToIdx.get(loopEm);
    return `O fluxo "Ir para" cria um loop (volta para a Pergunta ${idx + 1}). Ajuste as ramificações antes de salvar.`;
  }
  return null;
}

document.querySelector("#btn-studio-save-all")?.addEventListener("click", salvarFaseCompleta);
document.querySelector("#btn-studio-save-all-fim")?.addEventListener("click", salvarFaseCompleta);
btnSalvarAjustesFaseTopo?.addEventListener("click", salvarFaseCompleta);


function preVisualizarFase() {
  sincronizarModelComDOM();
  const aviso = document.querySelector("#studio-perguntas-aviso");
  if (perguntasModel.length === 0) {
    aviso.textContent = "Adicione ao menos uma pergunta para pré-visualizar.";
    aviso.classList.add("erro");
    return;
  }
  for (let i = 0; i < perguntasModel.length; i++) {
    const q = perguntasModel[i];
    const validas = q.alts.filter(a => a.texto.trim());
    if (!q.texto.trim() || validas.length < 2 || !validas.some(a => a.correta)) {
      aviso.textContent = `Pré-visualização: a Pergunta ${i + 1} está incompleta (precisa de texto, 2+ alternativas e 1 correta).`;
      aviso.classList.add("erro");
      const card = document.getElementById(`q-card-${q.id}`);
      if (card) { card.classList.remove("collapsed"); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return;
    }
  }
  abrirPreviewQuiz();
}

async function abrirPreviewQuiz() {
  const cor1 = document.querySelector("#studio-cd-cor1")?.value || "#6366f1";
  const titulo = document.querySelector("#studio-fase-titulo")?.value || "Pré-visualização";

  const perguntas = perguntasModel.map(q => ({
    id: q.id,
    texto: q.texto,
    imagem_url: q.imagem_url,
    alts: q.alts.filter(a => a.texto.trim()).map(a => ({
      texto: a.texto.trim(), correta: !!a.correta, proxima: a.proxima_pergunta_id || ""
    }))
  }));

  const imgMap = {};
  await Promise.all(perguntas.map(async p => { imgMap[p.id] = p.imagem_url ? await urlImagem(p.imagem_url) : ""; }));

  const state = { historico: [perguntas[0].id], respostas: {}, verificadas: {} };

  const modal = document.createElement("div");
  modal.className = "modal-bg";
  modal.style.cssText = `position: fixed; inset: 0; z-index: 100001; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; padding: 16px; --camp-cor: ${cor1};`;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  const fechar = () => { modal.remove(); document.body.classList.remove("modal-open"); };
  modal.addEventListener("click", e => { if (e.target === modal) fechar(); });

  const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const letra = i => ["A", "B", "C", "D", "E", "F", "G", "H"][i] || (i + 1);

  const proximaId = (q, altSel) => {
    if (altSel && altSel.proxima && perguntas.some(p => p.id === altSel.proxima)) return altSel.proxima;
    const idx = perguntas.findIndex(p => p.id === q.id);
    return (idx >= 0 && idx < perguntas.length - 1) ? perguntas[idx + 1].id : null;
  };

  function render() {
    const pid = state.historico[state.historico.length - 1];
    const q = perguntas.find(p => p.id === pid);
    const passo = state.historico.length;
    const selIdx = state.respostas[pid];
    const verif = state.verificadas[pid];
    const corretaIdx = q.alts.findIndex(a => a.correta);
    const altSel = verif && selIdx != null ? q.alts[selIdx] : null;
    const proxId = proximaId(q, altSel);
    const ehUltima = proxId === null;

    const altsHtml = q.alts.map((a, i) => {
      let cls = "";
      if (verif) {
        if (i === corretaIdx) cls = "certa";
        else if (i === selIdx) cls = "errada";
      } else if (selIdx === i) cls = "selecionada";
      return `<li class="quiz-alt ${cls}" data-i="${i}" style="${verif ? "pointer-events:none;" : ""}"><span class="alt-letra">${letra(i)}</span><span>${esc(a.texto)}</span></li>`;
    }).join("");

    modal.innerHTML = `
      <div class="quiz-container" style="max-width: 560px; width: 100%; --camp-cor: ${cor1};">
        <div class="quiz-header">
          <h3><i class="ph-fill ph-eye" style="margin-right:6px;"></i> Prévia · ${esc(titulo)}</h3>
          <button class="quiz-close" id="pv-x">✕</button>
        </div>
        <div class="quiz-progress">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${Math.min(passo / perguntas.length * 100, 100)}%;"></div></div>
          <span class="quiz-progress-text">Pergunta ${passo}/${perguntas.length}</span>
        </div>
        <div class="quiz-body">
          <div class="quiz-pergunta">${esc(q.texto)}</div>
          ${imgMap[pid] ? `<img src="${imgMap[pid]}" alt="" style="max-width:100%; border-radius:12px; margin-bottom:16px;" />` : ""}
          <ul class="quiz-alternativas">${altsHtml}</ul>
        </div>
        <div class="quiz-footer">
          <button class="quiz-btn-next" id="pv-prox" ${!verif ? "disabled" : ""}>${ehUltima ? "Ver resultado" : "Próxima"}</button>
        </div>
      </div>`;

    modal.querySelector("#pv-x").addEventListener("click", fechar);
    if (!verif) {
      modal.querySelectorAll(".quiz-alt").forEach(el => el.addEventListener("click", () => {
        state.respostas[pid] = parseInt(el.dataset.i, 10);
        state.verificadas[pid] = true;
        render();
      }));
    }
    modal.querySelector("#pv-prox")?.addEventListener("click", () => {
      if (ehUltima) renderResultado();
      else { state.historico.push(proxId); render(); }
    });
  }

  function renderResultado() {
    let acertos = 0;
    const total = state.historico.length;
    state.historico.forEach(pid => {
      const q = perguntas.find(p => p.id === pid);
      const selIdx = state.respostas[pid];
      if (selIdx != null && q.alts[selIdx]?.correta) acertos++;
    });
    const pct = total ? Math.round(acertos / total * 100) : 0;
    modal.innerHTML = `
      <div class="quiz-container" style="max-width: 560px; width: 100%; --camp-cor: ${cor1};">
        <div class="quiz-resultado">
          <div class="quiz-resultado-emoji">${pct === 100 ? "🏆" : pct >= 50 ? "🎉" : "💪"}</div>
          <h2>Prévia concluída</h2>
          <span class="sub">Você acertou ${acertos} de ${total}. Isto é só uma simulação — nada foi gravado.</span>
          <div class="quiz-resultado-btns" style="margin-top: 20px;">
            <button class="quiz-btn-next" id="pv-fechar">Fechar prévia</button>
          </div>
        </div>
      </div>`;
    modal.querySelector("#pv-fechar").addEventListener("click", fechar);
  }

  render();
}

document.querySelector("#btn-studio-preview")?.addEventListener("click", preVisualizarFase);


function mostrarConfirmacaoGenerica({ emoji = "❓", titulo = "Confirmar?", mensagem = "", confirmar = "Confirmar", cancelar = "Cancelar", cor = "#6366f1" }, onConfirm) {
  const modal = document.createElement("div");
  modal.className = "modal-bg";
  modal.style.zIndex = "100000";
  modal.innerHTML = `
    <div class="modal modal-anuncio-animated" style="max-width: 420px; --theme-color: ${cor}; animation: modalEntrada 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;">
      <div class="modal-inner" style="text-align: center; padding: 28px 24px;">
        <div style="font-size: 40px; margin-bottom: 16px;">${emoji}</div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--ink); margin: 0 0 12px 0;">${titulo}</h2>
        <p style="font-size: 13.5px; line-height: 1.6; color: var(--muted); margin: 0 0 24px 0;">${mensagem}</p>
        <div style="display: flex; gap: 12px; width: 100%;">
          <button data-cg-cancelar style="flex: 1; padding: 12px; border-radius: 12px; background: var(--canvas); color: var(--muted); border: 1px solid var(--border); font-size: 13px; font-weight: 700; cursor: pointer;">${cancelar}</button>
          <button data-cg-confirmar style="flex: 1; padding: 12px; border-radius: 12px; background: var(--theme-color); color: white; border: none; font-size: 13px; font-weight: 700; cursor: pointer;">${confirmar}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  const fechar = () => { modal.remove(); document.body.classList.remove("modal-open"); };
  modal.querySelector("[data-cg-cancelar]").addEventListener("click", fechar);
  modal.querySelector("[data-cg-confirmar]").addEventListener("click", () => { fechar(); onConfirm(); });
}


function rascunhoKey(faseId) { return RASCUNHO_PREFIXO + faseId; }

function agendarRascunho() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(salvarRascunhoLocal, 700);
}

function salvarRascunhoLocal() {
  if (!faseSelecionadaId) return;
  try {
    sincronizarModelComDOM();
    const draft = {
      salvoEm: Date.now(),
      ajustes: {
        titulo: document.querySelector("#studio-fase-titulo")?.value || "",
        tipo: document.querySelector("#studio-fase-tipo")?.value || "quiz",
        descricao: document.querySelector("#studio-fase-descricao")?.value || "",
        imagem_url: document.querySelector("#studio-fase-imagem-url")?.value || "",
        imagem_url_text: document.querySelector("#studio-fase-imagem-url-text")?.value || "",
        xp: document.querySelector("#studio-fase-xp")?.value || "0",
        pontos: document.querySelector("#studio-fase-pontos")?.value || "0",
        tempo: document.querySelector("#studio-fase-tempo")?.value || "",
        tentativas: document.querySelector("#studio-fase-tentativas")?.value || "",
        ativo: document.querySelector("#studio-fase-ativo")?.checked ?? true
      },
      perguntas: perguntasModel
    };
    localStorage.setItem(rascunhoKey(faseSelecionadaId), JSON.stringify(draft));
  } catch (e) { }
}

function limparRascunho(faseId) {
  try { localStorage.removeItem(rascunhoKey(faseId)); } catch {}
}

function oferecerRestauracaoRascunho(faseId) {
  let draft = null;
  try {
    const raw = localStorage.getItem(rascunhoKey(faseId));
    if (raw) draft = JSON.parse(raw);
  } catch { draft = null; }
  if (!draft || !Array.isArray(draft.perguntas)) return;

  mostrarConfirmacaoGenerica({
    emoji: "💾",
    cor: "#6366f1",
    titulo: "Rascunho não salvo encontrado",
    mensagem: `Há alterações desta fase guardadas localmente (${tempoRelativo(draft.salvoEm)}) que não chegaram a ser salvas no servidor. Deseja restaurar de onde parou?`,
    confirmar: "Restaurar",
    cancelar: "Descartar"
  }, () => aplicarRascunho(draft));
}

function aplicarRascunho(draft) {
  const a = draft.ajustes || {};
  const set = (sel, val) => { const el = document.querySelector(sel); if (el && val != null) el.value = val; };
  set("#studio-fase-titulo", a.titulo);
  set("#studio-fase-tipo", a.tipo);
  set("#studio-fase-descricao", a.descricao);
  set("#studio-fase-xp", a.xp);
  set("#studio-fase-pontos", a.pontos);
  set("#studio-fase-tempo", a.tempo);
  set("#studio-fase-tentativas", a.tentativas);
  set("#studio-fase-imagem-url", a.imagem_url);
  set("#studio-fase-imagem-url-text", a.imagem_url_text);
  const elAtivoRascunho = document.querySelector("#studio-fase-ativo");
  if (elAtivoRascunho && typeof a.ativo === "boolean") elAtivoRascunho.checked = a.ativo;

  perguntasModel = (draft.perguntas || []).map(q => ({
    id: q.id,
    texto: q.texto || "",
    imagem_url: q.imagem_url || "",
    alts: (q.alts || []).map(al => ({
      texto: al.texto || "",
      correta: !!al.correta,
      proxima_pergunta_id: al.proxima_pergunta_id || ""
    }))
  }));
  perguntasFase = perguntasModel;
  marcarStudioSujo();
  carregarPerguntasStudio(faseSelecionadaId, null, true);
  const aviso = document.querySelector("#studio-perguntas-aviso");
  if (aviso) { aviso.textContent = 'Rascunho restaurado. Revise e clique em "Salvar Fase".'; aviso.classList.remove("erro"); }
}

function tempoRelativo(ts) {
  if (!ts) return "há pouco";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "há instantes";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}


async function duplicarFaseCompleta(desafioId) {
  try {

    const { data: d, error: errD } = await supabase
      .from("desafios")
      .select("*")
      .eq("id", desafioId)
      .single();
    
    if (errD || !d) throw new Error(errD?.message || "Desafio original não encontrado.");

    const novaOrdem = d.ordem + 1;

    const payloadNovoDesafio = {
      campanha_id: d.campanha_id,
      titulo: `${d.titulo} (Cópia)`,
      descricao: d.descricao,
      imagem_url: d.imagem_url,
      tipo: d.tipo,
      tempo_segundos: d.tempo_segundos,
      max_tentativas: d.max_tentativas,
      xp_recompensa: d.xp_recompensa,
      pontos_recompensa: d.pontos_recompensa,
      ordem: novaOrdem,
      ativo: d.ativo
    };

    const { data: novoDesafio, error: errCrea } = await supabase
      .from("desafios")
      .insert(payloadNovoDesafio)
      .select("id")
      .single();

    if (errCrea || !novoDesafio) throw new Error(errCrea?.message || "Falha ao criar nova fase.");

    const { data: perguntasOriginais } = await supabase
      .from("desafio_perguntas")
      .select("*")
      .eq("desafio_id", desafioId)
      .order("ordem");

    if (!perguntasOriginais || perguntasOriginais.length === 0) {
      return;
    }

    const { data: alternativasOriginais } = await supabase
      .from("desafio_alternativas")
      .select("*")
      .in("pergunta_id", perguntasOriginais.map(q => q.id))
      .order("ordem");

    const idMapPerguntas = {};
    for (const p of perguntasOriginais) {
      const { data: novaP, error: errP } = await supabase
        .from("desafio_perguntas")
        .insert({
          desafio_id: novoDesafio.id,
          texto: p.texto,
          imagem_url: p.imagem_url,
          ordem: p.ordem
        })
        .select("id")
        .single();
      
      if (errP || !novaP) throw new Error(errP?.message || "Falha ao duplicar pergunta.");
      idMapPerguntas[p.id] = novaP.id;
    }

    const payloadAlternativas = (alternativasOriginais || [])
      .map(a => {

        const novoProximoId = a.proxima_pergunta_id ? (idMapPerguntas[a.proxima_pergunta_id] || null) : null;
        
        return {
          pergunta_id: idMapPerguntas[a.pergunta_id],
          texto: a.texto,
          correta: a.correta,
          ordem: a.ordem,
          proxima_pergunta_id: novoProximoId
        };
      })
      .filter(a => a.pergunta_id); 

    if (payloadAlternativas.length > 0) {
      const { error: errAlts } = await supabase
        .from("desafio_alternativas")
        .insert(payloadAlternativas);
      
      if (errAlts) throw errAlts;
    }

  } catch (err) {
    alert("Erro ao duplicar fase: " + err.message);
  }
}


const anuncioEditorBloco = document.querySelector("#anuncio-editor-bloco");
const formAnuncio = document.querySelector("#form-anuncio");
const anunciosAdminLista = document.querySelector("#anuncios-admin-lista");
const anuncioListaAviso = document.querySelector("#anuncio-lista-aviso");

const btnAnuncioNovo = document.querySelector("#btn-anuncio-novo");
const btnAnuncioCancelar = document.querySelector("#btn-anuncio-cancelar");

btnAnuncioNovo?.addEventListener("click", () => {
  document.querySelector("#anuncio-form-titulo").textContent = "Novo Comunicado";
  formAnuncio.reset();
  document.querySelector("#anuncio-id").value = "";
  document.querySelector("#anuncio-cor").value = "#6366f1";
  
  atualizarDestaqueCores("#6366f1");
  
  document.getElementById("anuncio-imagem-url").value = "";
  const anuncioImgUrlText = document.getElementById("anuncio-imagem-url-text");
  if (anuncioImgUrlText) anuncioImgUrlText.value = "";
  document.getElementById("anuncio-imagem-fit").value = "cover";
  document.getElementById("anuncio-imagem-ratio").value = "2.5-1";
  
  const defaultAnuncioImg = document.getElementById("anuncio-imagem-default");
  const previewAnuncioImg = document.getElementById("anuncio-imagem-preview");
  const parent = previewAnuncioImg?.closest(".studio-upload-box");
  if (parent) {
    parent.style.removeProperty("aspect-ratio");
    parent.style.removeProperty("min-height");
  }
  if (defaultAnuncioImg) defaultAnuncioImg.style.display = "flex";
  if (previewAnuncioImg) {
    previewAnuncioImg.style.display = "none";
    previewAnuncioImg.style.backgroundImage = "";
  }

  document.querySelector("#anuncio-inicio").value = formatarParaDataLocalInput(new Date());
  document.querySelector("#anuncio-fim").value = "";
  document.querySelector("#anuncio-ativo").checked = true;
  
  anuncioEditorBloco.hidden = false;
});

btnAnuncioCancelar?.addEventListener("click", () => {
  anuncioEditorBloco.hidden = true;
  formAnuncio.reset();
});

document.querySelector("#anuncio-imagem-file")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const defaultAnuncioImg = document.getElementById("anuncio-imagem-default");
  const previewAnuncioImg = document.getElementById("anuncio-imagem-preview");
  const textLabel = document.getElementById("anuncio-imagem-text");
  if (!file) return;

  if (textLabel) textLabel.textContent = "Subindo imagem… ⏳";

  try {
    const path = await uploadImagem(file);
    const fit = document.getElementById("anuncio-imagem-fit").value;
    const ratio = document.getElementById("anuncio-imagem-ratio").value;
    document.getElementById("anuncio-imagem-url").value = gerarUrlComHash(path, fit, ratio);
    
    const anuncioImgUrlText = document.getElementById("anuncio-imagem-url-text");
    if (anuncioImgUrlText) anuncioImgUrlText.value = path;
    
    const url = await urlImagem(path);
    if (defaultAnuncioImg) defaultAnuncioImg.style.display = "none";
    if (previewAnuncioImg) {
      previewAnuncioImg.style.display = "block";
      atualizarPreviewEstilo(previewAnuncioImg, url, fit, ratio);
    }
    if (textLabel) textLabel.textContent = "Clique para carregar imagem do comunicado...";
  } catch (err) {
    alert("Erro ao subir imagem do comunicado: " + err.message);
    if (textLabel) textLabel.textContent = "Erro ao subir imagem";
  }
});


document.getElementById("btn-remove-anuncio-imagem")?.addEventListener("click", (e) => {
  e.stopPropagation(); 
  document.getElementById("anuncio-imagem-url").value = "";
  document.getElementById("anuncio-imagem-file").value = "";
  const anuncioImgUrlText = document.getElementById("anuncio-imagem-url-text");
  if (anuncioImgUrlText) anuncioImgUrlText.value = "";
  document.getElementById("anuncio-imagem-fit").value = "cover";
  document.getElementById("anuncio-imagem-ratio").value = "2.5-1";
  
  const defaultAnuncioImg = document.getElementById("anuncio-imagem-default");
  const previewAnuncioImg = document.getElementById("anuncio-imagem-preview");
  const parent = previewAnuncioImg?.closest(".studio-upload-box");
  if (parent) {
    parent.style.removeProperty("aspect-ratio");
    parent.style.removeProperty("min-height");
  }
  if (defaultAnuncioImg) defaultAnuncioImg.style.display = "flex";
  if (previewAnuncioImg) {
    previewAnuncioImg.style.display = "none";
    previewAnuncioImg.style.backgroundImage = "";
  }
  const textLabel = document.getElementById("anuncio-imagem-text");
  if (textLabel) textLabel.textContent = "Clique para carregar imagem do comunicado...";
});

document.getElementById("anuncio-imagem-url-text")?.addEventListener("input", async (e) => {
  const val = e.target.value.trim();
  const fit = document.getElementById("anuncio-imagem-fit").value;
  const ratio = document.getElementById("anuncio-imagem-ratio").value;
  document.getElementById("anuncio-imagem-url").value = gerarUrlComHash(val, fit, ratio);
  
  const defaultAnuncioImg = document.getElementById("anuncio-imagem-default");
  const previewAnuncioImg = document.getElementById("anuncio-imagem-preview");
  
  if (val) {
    const url = await urlImagem(val);
    if (defaultAnuncioImg) defaultAnuncioImg.style.display = "none";
    if (previewAnuncioImg) {
      previewAnuncioImg.style.display = "block";
      atualizarPreviewEstilo(previewAnuncioImg, url, fit, ratio);
    }
  } else {
    const parent = previewAnuncioImg?.closest(".studio-upload-box");
    if (parent) {
      parent.style.removeProperty("aspect-ratio");
      parent.style.removeProperty("min-height");
    }
    if (defaultAnuncioImg) defaultAnuncioImg.style.display = "flex";
    if (previewAnuncioImg) {
      previewAnuncioImg.style.display = "none";
      previewAnuncioImg.style.backgroundImage = "";
    }
  }
});

document.getElementById("anuncio-imagem-fit")?.addEventListener("change", async (e) => {
  const fit = e.target.value;
  const ratio = document.getElementById("anuncio-imagem-ratio").value;
  const rawUrl = document.getElementById("anuncio-imagem-url-text").value.trim();
  if (rawUrl) {
    document.getElementById("anuncio-imagem-url").value = gerarUrlComHash(rawUrl, fit, ratio);
    const url = await urlImagem(rawUrl);
    const previewAnuncioImg = document.getElementById("anuncio-imagem-preview");
    atualizarPreviewEstilo(previewAnuncioImg, url, fit, ratio);
  }
});

// Bind de Alteração de Proporção/Tamanho de Imagem do Comunicado
document.getElementById("anuncio-imagem-ratio")?.addEventListener("change", async (e) => {
  const ratio = e.target.value;
  const fit = document.getElementById("anuncio-imagem-fit").value;
  const rawUrl = document.getElementById("anuncio-imagem-url-text").value.trim();
  if (rawUrl) {
    document.getElementById("anuncio-imagem-url").value = gerarUrlComHash(rawUrl, fit, ratio);
    const url = await urlImagem(rawUrl);
    const previewAnuncioImg = document.getElementById("anuncio-imagem-preview");
    atualizarPreviewEstilo(previewAnuncioImg, url, fit, ratio);
  }
});

document.querySelectorAll(".cor-preset-circle").forEach(circle => {
  circle.addEventListener("click", (e) => {
    const cor = e.currentTarget.dataset.cor;
    document.getElementById("anuncio-cor").value = cor;
    atualizarDestaqueCores(cor);
  });
});

document.getElementById("anuncio-cor")?.addEventListener("input", (e) => {
  atualizarDestaqueCores(e.target.value);
});

function atualizarDestaqueCores(corSelecionada) {
  let presetEncontrado = false;
  document.querySelectorAll(".cor-preset-circle").forEach(c => {
    if (c.dataset.cor.toLowerCase() === corSelecionada.toLowerCase()) {
      c.style.borderColor = "var(--ink)";
      c.style.boxShadow = "0 0 0 2px var(--surface)";
      presetEncontrado = true;
    } else {
      c.style.borderColor = "transparent";
      c.style.boxShadow = "none";
    }
  });

  const btnPalette = document.getElementById("btn-anuncio-cor-custom");
  if (btnPalette) {
    if (!presetEncontrado) {
      btnPalette.style.background = corSelecionada;
      btnPalette.style.borderColor = "var(--ink)";
    } else {
      btnPalette.style.background = "var(--surface)";
      btnPalette.style.borderColor = "var(--border)";
    }
  }
}

formAnuncio?.addEventListener("submit", async (e) => {
  e.preventDefault();
  anuncioListaAviso.textContent = "";
  anuncioListaAviso.classList.remove("erro");

  const id = document.querySelector("#anuncio-id").value || null;
  const payload = {
    titulo: document.querySelector("#anuncio-titulo").value.trim(),
    conteudo: document.querySelector("#anuncio-conteudo").value.trim(),
    imagem_url: document.querySelector("#anuncio-imagem-url").value.trim() || null,
    cor_destaque: document.querySelector("#anuncio-cor").value,
    inicio: converterParaUtcIso(document.querySelector("#anuncio-inicio").value) || new Date().toISOString(),
    fim: converterParaUtcIso(document.querySelector("#anuncio-fim").value),
    ativo: document.querySelector("#anuncio-ativo").checked,
    atualizado_em: new Date().toISOString()
  };

  let res;
  if (id) {
    res = await supabase.from("anuncios").update(payload).eq("id", id).select("id").single();
  } else {
    res = await supabase.from("anuncios").insert(payload).select("id").single();
  }

  if (res.error) {
    anuncioListaAviso.textContent = "Erro ao salvar comunicado: " + res.error.message;
    anuncioListaAviso.classList.add("erro");
    return;
  }

  anuncioEditorBloco.hidden = true;
  formAnuncio.reset();
  carregarAnunciosAdmin();
});

async function carregarAnunciosAdmin() {
  if (!anunciosAdminLista) return;
  anunciosAdminLista.innerHTML = '<p class="vazio" style="padding: 10px 0;">Carregando comunicados...</p>';
  anuncioListaAviso.textContent = "";

  const { data: anuncios, error } = await supabase
    .from("anuncios")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) {
    anunciosAdminLista.innerHTML = '<p class="vazio">Erro ao carregar comunicados.</p>';
    return;
  }

  if (!anuncios || anuncios.length === 0) {
    anunciosAdminLista.innerHTML = '<p class="vazio" style="padding: 20px 0;">Nenhum comunicado criado ainda.</p>';
    return;
  }

  anunciosAdminLista.innerHTML = anuncios
    .map((a) => {
      const isExpired = a.fim && new Date(a.fim) < new Date();
      const isFuture = new Date(a.inicio) > new Date();
      
      let statusText = "ATIVO";
      let statusColor = "var(--pos)";
      
      if (!a.ativo) {
        statusText = "INATIVO";
        statusColor = "var(--muted)";
      } else if (isExpired) {
        statusText = "EXPIRADO";
        statusColor = "var(--neg)";
      } else if (isFuture) {
        statusText = "AGENDADO";
        statusColor = "var(--orange)";
      }

      return `
      <li class="anuncio-item-card" style="border-left: 5px solid ${a.cor_destaque}; margin-bottom: 8px; cursor: default;">
        <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 14px; color: var(--ink);">${a.titulo}</strong>
            <span style="font-size: 10px; font-weight: 800; background: ${statusColor}15; color: ${statusColor}; padding: 2px 6px; border-radius: 4px;">${statusText}</span>
          </div>
          <span style="font-size: 11px; color: var(--muted); line-height: 1.4; max-width: 500px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
            ${a.conteudo.replace(/<[^>]*>/g, '')}
          </span>
          <span style="font-size: 10px; color: var(--muted); margin-top: 2px;">
            Início: ${new Date(a.inicio).toLocaleString()} ${a.fim ? `· Fim: ${new Date(a.fim).toLocaleString()}` : ""}
          </span>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0;" onclick="event.stopPropagation()">
          <button type="button" class="link" data-editar-anuncio="${a.id}" title="Editar comunicado" style="font-size: 11px; padding: 4px; color: var(--muted);"><i class="ph-fill ph-pencil-simple" style="font-size:16px;"></i></button>
          <button type="button" class="link btn-desativar" data-excluir-anuncio="${a.id}" title="Excluir comunicado" style="font-size: 11px; padding: 4px; color: var(--neg);"><i class="ph-fill ph-trash" style="font-size:16px;"></i></button>
        </div>
      </li>`;
    })
    .join("");

  anunciosAdminLista.querySelectorAll("[data-editar-anuncio]").forEach((btn) => {
    btn.addEventListener("click", () => editarAnuncioAdmin(btn.dataset.editarAnuncio));
  });

  anunciosAdminLista.querySelectorAll("[data-excluir-anuncio]").forEach((btn) => {
    btn.addEventListener("click", () => excluirAnuncioAdmin(btn.dataset.excluirAnuncio));
  });
}

async function editarAnuncioAdmin(id) {
  anuncioListaAviso.textContent = "Carregando comunicado…";
  const { data: a, error } = await supabase.from("anuncios").select("*").eq("id", id).single();
  if (error || !a) {
    anuncioListaAviso.textContent = "Erro ao carregar comunicado.";
    anuncioListaAviso.classList.add("erro");
    return;
  }
  anuncioListaAviso.textContent = "";

  document.querySelector("#anuncio-form-titulo").textContent = "Editar Comunicado";
  document.querySelector("#anuncio-id").value = a.id;
  document.querySelector("#anuncio-titulo").value = a.titulo;
  document.querySelector("#anuncio-conteudo").value = a.conteudo;
  document.querySelector("#anuncio-cor").value = a.cor_destaque;
  document.querySelector("#anuncio-inicio").value = formatarParaDataLocalInput(a.inicio);
  document.querySelector("#anuncio-fim").value = formatarParaDataLocalInput(a.fim);
  document.querySelector("#anuncio-ativo").checked = a.ativo;

  atualizarDestaqueCores(a.cor_destaque);

  const defaultAnuncioImg = document.getElementById("anuncio-imagem-default");
  const previewAnuncioImg = document.getElementById("anuncio-imagem-preview");
  const anuncioImgUrlText = document.getElementById("anuncio-imagem-url-text");
  
  if (a.imagem_url) {
    const { url: cleanUrl, fit, ratio } = obterAjusteImagem(a.imagem_url);
    document.getElementById("anuncio-imagem-url").value = a.imagem_url;
    if (anuncioImgUrlText) anuncioImgUrlText.value = cleanUrl;
    document.getElementById("anuncio-imagem-fit").value = fit;
    document.getElementById("anuncio-imagem-ratio").value = ratio;
    const url = await urlImagem(cleanUrl);
    if (defaultAnuncioImg) defaultAnuncioImg.style.display = "none";
    if (previewAnuncioImg) {
      previewAnuncioImg.style.display = "block";
      atualizarPreviewEstilo(previewAnuncioImg, url, fit, ratio);
    }
  } else {
    document.getElementById("anuncio-imagem-url").value = "";
    if (anuncioImgUrlText) anuncioImgUrlText.value = "";
    document.getElementById("anuncio-imagem-fit").value = "cover";
    document.getElementById("anuncio-imagem-ratio").value = "2.5-1";
    
    const parent = previewAnuncioImg?.closest(".studio-upload-box");
    if (parent) {
      parent.style.removeProperty("aspect-ratio");
      parent.style.removeProperty("min-height");
    }
    if (defaultAnuncioImg) defaultAnuncioImg.style.display = "flex";
    if (previewAnuncioImg) {
      previewAnuncioImg.style.display = "none";
      previewAnuncioImg.style.backgroundImage = "";
    }
  }

  anuncioEditorBloco.hidden = false;
  anuncioEditorBloco.scrollIntoView({ behavior: "smooth" });
}

async function excluirAnuncioAdmin(id) {
  if (!confirm("Tem certeza de que deseja excluir este comunicado? Esta ação não pode ser desfeita.")) return;
  anuncioListaAviso.textContent = "Excluindo comunicado…";
  const { error } = await supabase.from("anuncios").delete().eq("id", id);
  if (error) {
    anuncioListaAviso.textContent = "Erro ao excluir: " + error.message;
    anuncioListaAviso.classList.add("erro");
  } else {
    carregarAnunciosAdmin();
  }
}

document.getElementById("btn-anuncio-preview")?.addEventListener("click", abrirPreviewAnuncio);

function abrirPreviewAnuncio() {
  const titulo = document.querySelector("#anuncio-titulo").value.trim() || "Título do Comunicado";
  const conteudo = document.querySelector("#anuncio-conteudo").value.trim() || "Escreva o conteúdo em *Markdown* para visualizar aqui...";
  const rawImgUrl = document.querySelector("#anuncio-imagem-url").value.trim();
  const corDestaque = document.querySelector("#anuncio-cor").value;

  const conteudoHtml = marked.parse(conteudo);
  
  let imgHtml = "";
  if (rawImgUrl) {
    const { url, fit, ratio } = obterAjusteImagem(rawImgUrl);
    const ratioValue = MAPA_RATIOS[ratio] || "2.5 / 1";
    
    urlImagem(url).then(publicUrl => {
      const imgEl = document.querySelector("#preview-modal-anuncio-img-box");
      if (!imgEl) return;
      
      if (fit === "contain-blur") {
        imgEl.innerHTML = `
          <div style="position: absolute; inset: 0; background: url('${publicUrl}') no-repeat center/cover; filter: blur(15px) brightness(0.65); transform: scale(1.15);"></div>
          <div style="position: absolute; inset: 0; background: url('${publicUrl}') no-repeat center/contain;"></div>
        `;
        imgEl.style.aspectRatio = ratioValue;
        imgEl.style.display = "block";
      } else if (fit === "contain") {
        imgEl.innerHTML = "";
        imgEl.style.background = `var(--canvas) url('${publicUrl}') no-repeat center/contain`;
        imgEl.style.aspectRatio = ratioValue;
        imgEl.style.display = "block";
      } else {
        imgEl.innerHTML = "";
        imgEl.style.background = `url('${publicUrl}') no-repeat center/cover`;
        imgEl.style.aspectRatio = ratioValue;
        imgEl.style.display = "block";
      }
    });
    
    imgHtml = `<div id="preview-modal-anuncio-img-box" style="position: relative; overflow: hidden; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--border); background: var(--canvas); display: none;"></div>`;
  }

  const modal = document.createElement("div");
  modal.id = "modal-anuncio-preview";
  modal.className = "modal-bg";
  modal.style.zIndex = "99999";
  
  modal.innerHTML = `
    <div class="modal modal-anuncio-animated" style="max-width: 480px; --theme-color: ${corDestaque}; animation: modalEntrada 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;">
      <div class="modal-inner">
        <button class="modal-close" id="btn-fechar-anuncio-preview" style="position: absolute; top: 16px; right: 16px; font-size: 16px; background: none; border: none; cursor: pointer; color: var(--muted); transition: color 0.2s; z-index: 10;">✕</button>
        
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="background: ${corDestaque}15; color: ${corDestaque}; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Pré-visualização</span>
        </div>

        <h2 style="font-size: 20px; font-weight: 800; color: var(--ink); margin: 0 0 16px 0; line-height: 1.3;">${titulo}</h2>
        
        ${imgHtml}
        
        <div class="anuncio-conteudo" style="font-size: 13.5px; line-height: 1.6; color: var(--muted); max-height: 240px; overflow-y: auto; margin-bottom: 24px; padding-right: 4px;">
          ${conteudoHtml}
        </div>

        <button id="btn-entendido-anuncio-preview" style="width: 100%; padding: 12px; border-radius: 12px; background: ${corDestaque}; color: white; border: none; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity 0.2s, transform 0.1s;">
          <i class="ph-fill ph-check-circle" style="font-size: 16px;"></i> Fechar Preview
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const fechar = () => {
    modal.remove();
    document.body.classList.remove("modal-open");
  };

  modal.querySelector("#btn-fechar-anuncio-preview").addEventListener("click", fechar);
  modal.querySelector("#btn-entendido-anuncio-preview").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) fechar();
  });
}

// Bind de Abrir/Fechar Guia de Markdown
const modalMarkdownGuia = document.getElementById("modal-markdown-guia");
document.getElementById("btn-markdown-ajuda")?.addEventListener("click", () => {
  if (modalMarkdownGuia) modalMarkdownGuia.hidden = false;
});
document.getElementById("btn-fechar-markdown-guia")?.addEventListener("click", () => {
  if (modalMarkdownGuia) modalMarkdownGuia.hidden = true;
});
document.getElementById("btn-entendido-markdown-guia")?.addEventListener("click", () => {
  if (modalMarkdownGuia) modalMarkdownGuia.hidden = true;
});
modalMarkdownGuia?.addEventListener("click", (e) => {
  if (e.target === modalMarkdownGuia) modalMarkdownGuia.hidden = true;
});

