import { supabase, COIN_SVG, addToCart } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { urlImagem } from "./storage.js";
import { montarHeader } from "./header.js";

const id = new URLSearchParams(location.search).get("id");
const el = document.querySelector("#produto");
const aviso = document.querySelector("#aviso");
let produtoCarregado = null;

const session = await requireAuth();
if (session) {
  montarHeader("loja");
  carregar();
}

async function carregar() {
  if (!id) {
    el.innerHTML = "<p class='vazio'>Produto não informado.</p>";
    return;
  }

  el.innerHTML = `
    <div class="produto-detalhe">
      <div class="skeleton skeleton-img grande" style="height: 400px; width: 100%;"></div>
      <div class="produto-detalhe-info" style="width: 100%;">
        <div class="skeleton skeleton-title" style="height: 32px; width: 60%; margin-bottom: 16px;"></div>
        <div class="skeleton skeleton-desc" style="height: 16px; width: 100%; margin-bottom: 8px;"></div>
        <div class="skeleton skeleton-desc" style="height: 16px; width: 90%; margin-bottom: 8px;"></div>
        <div class="skeleton skeleton-desc" style="height: 16px; width: 75%; margin-bottom: 24px;"></div>
        <div class="skeleton skeleton-price" style="height: 24px; width: 30%; margin-bottom: 16px;"></div>
        <div class="skeleton skeleton-text" style="height: 14px; width: 20%; margin-bottom: 24px;"></div>
        <div class="produto-acoes" style="padding-top: 12px; display: flex; gap: 12px;">
          <div class="skeleton skeleton-btn" style="height: 40px; width: 180px;"></div>
          <div class="skeleton skeleton-btn" style="height: 20px; width: 100px;"></div>
        </div>
      </div>
    </div>`;

  const [{ data: p }, { data: fav }, { data: cont }] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, nome, descricao, preco, estoque, imagem_url, ativo")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("favoritos").select("id").eq("produto_id", id).maybeSingle(),
    supabase.from("produtos_favoritos").select("total").eq("produto_id", id).maybeSingle(),
  ]);

  if (!p || !p.ativo) {
    el.innerHTML = "<p class='vazio'>Produto não encontrado.</p>";
    return;
  }

  produtoCarregado = p;
  const img = await urlImagem(p.imagem_url);
  const favorito = !!fav;
  const total = cont?.total ?? 0;

  el.innerHTML = `
    <div class="produto-detalhe">
      <div class="produto-img grande">
        ${img ? `<img src="${img}" alt="${p.nome}" />` : `<span class="ph">🎁</span>`}
        <button class="fav ${favorito ? "on" : ""}" id="fav">
          ${favorito ? "❤️" : "🤍"} <span>${total}</span>
        </button>
      </div>
      <div class="produto-detalhe-info">
        <h1>${p.nome}</h1>
        <p>${p.descricao ?? ""}</p>
        <strong class="preco">${COIN_SVG} ${p.preco} CRcoins</strong>
        <span class="estoque">${p.estoque > 0 ? p.estoque + " em estoque" : "Esgotado"}</span>
        <div class="produto-acoes">
          <button id="comprar" ${p.estoque > 0 ? "" : "disabled"}>
            ${p.estoque > 0 ? "Adicionar ao carrinho" : "Esgotado"}
          </button>
          <button class="link" id="share">compartilhar</button>
        </div>
      </div>
    </div>`;

  document.querySelector("#comprar").addEventListener("click", comprar);
  document.querySelector("#fav").addEventListener("click", favoritar);
  document.querySelector("#share").addEventListener("click", compartilhar);
}

async function favoritar() {
  const { data } = await supabase
    .from("favoritos")
    .select("id")
    .eq("produto_id", id)
    .maybeSingle();

  if (data) await supabase.from("favoritos").delete().eq("id", data.id);
  else
    await supabase
      .from("favoritos")
      .insert({ usuario_id: session.user.id, produto_id: id });

  carregar();
}

function comprar() {
  if (!produtoCarregado) return;
  
  addToCart(produtoCarregado);

  const btn = document.querySelector("#comprar");
  const textoOriginal = btn.textContent;
  btn.textContent = "Adicionado! 🛒";
  btn.style.backgroundColor = "var(--pos, #4caf50)";
  btn.style.color = "white";

  setTimeout(() => {
    btn.textContent = textoOriginal;
    btn.style.backgroundColor = "";
    btn.style.color = "";
  }, 1000);
}

async function compartilhar(e) {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    e.target.textContent = "link copiado!";
    setTimeout(() => (e.target.textContent = "compartilhar"), 1500);
  } catch {
    prompt("Copie o link:", url);
  }
}
