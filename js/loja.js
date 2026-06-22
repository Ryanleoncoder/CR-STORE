import { supabase, COIN_SVG, addToCart, cartCount } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { urlImagem } from "./storage.js";
import { montarHeader } from "./header.js";

const grade = document.querySelector("#produtos");
const aviso = document.querySelector("#loja-aviso");
const stripCat = document.querySelector("#categorias");
let todosProdutos = [];
let favSet = new Set();
let contMap = {};
let imgMap = {};
let catAtiva = "Todos";

const session = await requireAuth();
if (session) {
  montarHeader("loja");
  carregar();
  atualizarBadge();

  supabase
    .channel("produtos-rt")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "produtos" },
      (payload) => {
        const id = payload.new?.id;
        if (!id || typeof payload.new.favoritos_total !== "number") return;
        contMap[id] = payload.new.favoritos_total;
        const span = grade.querySelector(`[data-fav="${id}"] span`);
        if (span) span.textContent = contMap[id];
      }
    )
    .subscribe();
}

async function carregar() {
  mostrarSkeletonsLoja();
  const [{ data: produtos }, { data: meusFav }] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, nome, descricao, preco, estoque, imagem_url, categoria, favoritos_total")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("favoritos").select("produto_id"),
  ]);

  if (!produtos || produtos.length === 0) {
    stripCat.innerHTML = "";
    grade.innerHTML = "<p class='vazio'>Nenhum produto disponível.</p>";
    return;
  }

  todosProdutos = produtos;
  favSet = new Set((meusFav ?? []).map((f) => f.produto_id));
  contMap = Object.fromEntries(produtos.map((p) => [p.id, p.favoritos_total ?? 0]));
  const imgs = await Promise.all(produtos.map((p) => urlImagem(p.imagem_url)));
  imgMap = {};
  produtos.forEach((p, i) => (imgMap[p.id] = imgs[i]));

  construirCategorias();
  renderGrade();
}

function construirCategorias() {
  const cats = ["Todos", ...new Set(todosProdutos.map((p) => p.categoria).filter(Boolean))];
  if (cats.length <= 1) {
    stripCat.innerHTML = "";
    return;
  }
  stripCat.innerHTML = cats
    .map((c) => `<button class="cat-b ${c === catAtiva ? "on" : ""}" data-cat="${c}">${c}</button>`)
    .join("");
  stripCat.querySelectorAll("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      catAtiva = b.dataset.cat;
      construirCategorias();
      renderGrade();
    })
  );
}

function renderGrade() {
  const lista =
    catAtiva === "Todos"
      ? todosProdutos
      : todosProdutos.filter((p) => p.categoria === catAtiva);

  if (lista.length === 0) {
    grade.innerHTML = "<p class='vazio'>Nenhum produto nesta categoria.</p>";
    return;
  }

  grade.innerHTML = lista
    .map((p, i) => card(p, imgMap[p.id], favSet.has(p.id), contMap[p.id] ?? 0, i))
    .join("");
  ligarEventos();
}

const BG_CLASSES = ['bg-warm', 'bg-pink', 'bg-mint', 'bg-gold', 'bg-lilac', 'bg-peach'];
const EMOJIS = ['🎁', '☕', '👕', '🧴', '🧢', '💎', '🏆', '⭐'];

function bgFor(idx) { return BG_CLASSES[idx % BG_CLASSES.length]; }
function emojiFor(idx) { return EMOJIS[idx % EMOJIS.length]; }

function card(p, img, fav, total, idx) {
  return `
    <article class="produto" style="animation-delay: ${idx * 0.06}s">
      <div class="produto-img ${img ? '' : bgFor(idx)}">
        ${img ? `<img src="${img}" alt="${p.nome}" data-goto="${p.id}" />` : `<span class="ph" data-goto="${p.id}">${emojiFor(idx)}</span>`}
        <button class="fav ${fav ? "on" : ""}" data-fav="${p.id}">
          <i class="ph-fill ph-heart"></i> <span>${total}</span>
        </button>
      </div>
      <h3>${p.nome}</h3>
      <p>${p.descricao ?? ""}</p>
      <div class="produto-rodape">
        <b>${COIN_SVG} ${p.preco}</b>
        <span>${p.estoque > 0 ? p.estoque + " em estoque" : "Esgotado"}</span>
      </div>
      <div class="produto-acoes">
        <button class="comprar" data-comprar="${p.id}" ${p.estoque > 0 ? "" : "disabled"}>
          ${p.estoque > 0 ? "Adicionar ao carrinho" : "Esgotado"}
        </button>
        <button class="link" data-share="${p.id}">compartilhar</button>
      </div>
    </article>`;
}

function ligarEventos() {
  grade.querySelectorAll("[data-fav]").forEach((b) =>
    b.addEventListener("click", () => favoritar(b.dataset.fav))
  );
  grade.querySelectorAll("[data-comprar]").forEach((b) =>
    b.addEventListener("click", () => comprar(b.dataset.comprar, b))
  );
  grade.querySelectorAll("[data-share]").forEach((b) =>
    b.addEventListener("click", () => compartilhar(b.dataset.share, b))
  );
  grade.querySelectorAll("[data-goto]").forEach((el) =>
    el.addEventListener("click", () => {
      window.location.href = `/produto?id=${el.dataset.goto}`;
    })
  );
}

async function favoritar(id) {
  const btn = grade.querySelector(`[data-fav="${id}"]`);
  const eraFav = favSet.has(id);

  if (eraFav) {
    favSet.delete(id);
    contMap[id] = Math.max(0, (contMap[id] ?? 1) - 1);
  } else {
    favSet.add(id);
    contMap[id] = (contMap[id] ?? 0) + 1;
  }
  if (btn) {
    btn.classList.toggle("on", favSet.has(id));
    const span = btn.querySelector("span");
    if (span) span.textContent = contMap[id] ?? 0;
  }

  if (eraFav) {
    const { data } = await supabase
      .from("favoritos")
      .select("id")
      .eq("produto_id", id)
      .maybeSingle();
    if (data) await supabase.from("favoritos").delete().eq("id", data.id);
  } else {
    await supabase
      .from("favoritos")
      .insert({ usuario_id: session.user.id, produto_id: id });
  }
}

function comprar(id, btn) {
  const prod = todosProdutos.find((p) => p.id === id);
  if (!prod) return;

  addToCart(prod);

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

function atualizarBadge() {
  const badge = document.querySelector("#cart-badge");
  if (!badge) return;
  const count = cartCount();
  badge.textContent = count;
  badge.hidden = count === 0;
}

window.addEventListener("cart-updated", atualizarBadge);

async function compartilhar(id, btn) {
  const url = `${window.location.origin}/produto?id=${id}`;
  try {
    await navigator.clipboard.writeText(url);
    const txt = btn.textContent;
    btn.textContent = "link copiado!";
    setTimeout(() => (btn.textContent = txt), 1500);
  } catch {
    prompt("Copie o link:", url);
  }
}

function mostrarSkeletonsLoja() {
  const skeletons = Array(6)
    .fill(0)
    .map(
      () => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-img"></div>
        <div class="skeleton skeleton-title" style="margin-top: 8px;"></div>
        <div class="skeleton skeleton-desc"></div>
        <div class="skeleton skeleton-price" style="margin-top: 12px;"></div>
        <div class="skeleton skeleton-btn" style="margin-top: 12px;"></div>
      </div>`
    )
    .join("");
  grade.innerHTML = skeletons;
}
