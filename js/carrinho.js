import { supabase, getCart, updateCartQty, removeFromCart, clearCart, cartTotal, cartCount } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { montarHeader } from "./header.js";
import { urlImagem } from "./storage.js";

const cartItensEl = document.querySelector("#cart-itens");
const cartAviso = document.querySelector("#cart-aviso");
const subtotalQtdEl = document.querySelector("#subtotal-qtd");
const totalPagarEl = document.querySelector("#total-pagar");
const saldoAtualEl = document.querySelector("#saldo-atual");
const saldoAvisoEl = document.querySelector("#saldo-insuficiente-aviso");
const btnCheckout = document.querySelector("#btn-checkout");

const session = await requireAuth();
let userSaldo = 0;

if (session) {
  montarHeader("loja");
  await carregarSaldo();
  renderCarrinho();
}

window.addEventListener("cart-updated", () => {
  renderCarrinho();
});

async function carregarSaldo() {
  const { data } = await supabase.from("carteiras").select("saldo").single();
  userSaldo = data?.saldo ?? 0;
  saldoAtualEl.textContent = `${userSaldo} pts`;
}

async function renderCarrinho() {
  const cart = getCart();

  if (!cart || cart.length === 0) {
    cartItensEl.innerHTML = `<li class="vazio">Seu carrinho está vazio. <a href="loja.html" class="link">Ir para a loja</a></li>`;
    subtotalQtdEl.textContent = "0 itens";
    totalPagarEl.textContent = "0 pts";
    btnCheckout.disabled = true;
    saldoAvisoEl.hidden = true;
    return;
  }

  const total = cartTotal();
  const count = cartCount();

  subtotalQtdEl.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  totalPagarEl.textContent = `${total} pts`;

  const temSaldo = userSaldo >= total;
  saldoAvisoEl.hidden = temSaldo;
  btnCheckout.disabled = !temSaldo;

  cartItensEl.innerHTML = cart.map(() => `
    <li class="carrinho-item skeleton-row" style="border: none; padding: 14px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;">
      <div class="skeleton" style="width: 60px; height: 60px; border-radius: 8px; flex-shrink: 0;"></div>
      <div class="skeleton-text" style="flex-grow: 1;">
        <div class="skeleton skeleton-line1" style="width: 50%; height: 14px;"></div>
        <div class="skeleton skeleton-line2" style="width: 30%; height: 10px; margin-top: 6px;"></div>
      </div>
      <div class="skeleton" style="width: 80px; height: 32px; border-radius: var(--r-pill);"></div>
    </li>
  `).join("");

  const imgUrls = await Promise.all(cart.map(item => urlImagem(item.image_url)));

  cartItensEl.innerHTML = cart
    .map(
      (item, i) => `
      <li class="carrinho-item">
        <div class="carrinho-item-img">
          ${imgUrls[i] ? `<img src="${imgUrls[i]}" alt="" />` : "🎁"}
        </div>
        <div class="carrinho-item-detalhes">
          <h3>${item.name}</h3>
          <span>${item.price} pts cada</span>
        </div>
        <div class="carrinho-item-acoes">
          <div class="controlador-qtd">
            <button class="btn-qtd-menos" data-id="${item.id}" data-qty="${item.qty}">-</button>
            <span class="qtd-val">${item.qty}</span>
            <button class="btn-qtd-mais" data-id="${item.id}" data-qty="${item.qty}">+</button>
          </div>
          <button class="btn-remover-item" data-id="${item.id}">remover</button>
        </div>
      </li>`
    )
    .join("");

  cartItensEl.querySelectorAll(".btn-qtd-menos").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const currentQty = parseInt(btn.dataset.qty, 10);
      updateCartQty(id, currentQty - 1);
    });
  });

  cartItensEl.querySelectorAll(".btn-qtd-mais").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const currentQty = parseInt(btn.dataset.qty, 10);
      updateCartQty(id, currentQty + 1);
    });
  });

  cartItensEl.querySelectorAll(".btn-remover-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      removeFromCart(id);
    });
  });
}

btnCheckout.addEventListener("click", async () => {
  btnCheckout.disabled = true;
  cartAviso.textContent = "";
  cartAviso.classList.remove("erro");

  const cart = getCart();
  if (cart.length === 0) return;

  const overlay = document.querySelector("#checkout-loading-overlay");
  if (overlay) overlay.hidden = false;

  const itensParam = cart.map((item) => ({
    produto_id: item.id,
    quantidade: item.qty,
  }));

  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const { data: pedidoId, error } = await supabase.rpc("finalizar_pedido", {
      p_itens: itensParam,
    });

    if (error) throw error;

    clearCart();
    if (overlay) {
      overlay.querySelector(".checkout-overlay-content").innerHTML = `
        <svg viewBox="0 0 52 52" class="compra-ok-svg">
          <circle class="compra-ok-bg" cx="26" cy="26" r="25"></circle>
          <path class="compra-ok-check" d="M15 27 l7 7 l15 -16"></path>
        </svg>
        <p>Pedido confirmado! 🎉</p>`;
    }

    await new Promise((resolve) => setTimeout(resolve, 1600));
    window.location.href = "loja.html";
  } catch (err) {
    if (overlay) overlay.hidden = true;
    cartAviso.textContent = err.message || "Erro ao finalizar pedido.";
    cartAviso.classList.add("erro");
    btnCheckout.disabled = false;
  }
});
