import { createClient } from "@supabase/supabase-js";
import { getAccessToken } from "./auth-token.js";

const chave =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;


export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, chave, {
  accessToken: async () => (await getAccessToken()) || "",
});

export const COIN_SVG = `<img src="/assets/images/crcoins.webp" class="coin-token" alt="CRC" />`;

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem("cr_store_cart") || "[]");
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem("cr_store_cart", JSON.stringify(cart));
}

export function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.nome,
      price: product.preco,
      qty: 1,
      image_url: product.imagem_url
    });
  }
  saveCart(cart);
  window.dispatchEvent(new Event("cart-updated"));
}

export function removeFromCart(id) {
  let cart = getCart();
  cart = cart.filter(item => item.id !== id);
  saveCart(cart);
  window.dispatchEvent(new Event("cart-updated"));
}

export function updateCartQty(id, qty) {
  let cart = getCart();
  const item = cart.find(x => x.id === id);
  if (item) {
    item.qty = qty;
    if (item.qty <= 0) {
      cart = cart.filter(x => x.id !== id);
    }
  }
  saveCart(cart);
  window.dispatchEvent(new Event("cart-updated"));
}

export function clearCart() {
  localStorage.removeItem("cr_store_cart");
  window.dispatchEvent(new Event("cart-updated"));
}

export function cartCount() {
  return getCart().reduce((sum, item) => sum + item.qty, 0);
}

export function cartTotal() {
  return getCart().reduce((sum, item) => sum + (item.price * item.qty), 0);
}
