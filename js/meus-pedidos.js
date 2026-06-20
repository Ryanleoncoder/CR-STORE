import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { montarHeader } from "./header.js";
import { urlImagem } from "./storage.js";

const lista = document.querySelector("#meus-pedidos");
const aviso = document.querySelector("#pedidos-aviso");

const session = await requireAuth();
if (session) {
  montarHeader("pedidos");
  carregar();
}

const STATUS = {
  pendente: { label: "Aguardando confirmação", classe: "badge-pendente" },
  confirmado: { label: "Confirmado", classe: "badge-confirmado" },
  entregue: { label: "Entregue", classe: "badge-entregue" },
  cancelado: { label: "Cancelado", classe: "badge-cancelado" },
};

function skeleton() {
  lista.innerHTML = Array(3).fill(0).map(() => `
    <li class="pedido-card">
      <div style="display:flex;justify-content:space-between;">
        <div class="skeleton" style="width:120px;height:16px;"></div>
        <div class="skeleton" style="width:90px;height:22px;border-radius:9999px;"></div>
      </div>
      <div class="skeleton" style="width:100%;height:48px;border-radius:12px;"></div>
      <div class="skeleton" style="width:80px;height:16px;"></div>
    </li>
  `).join("");
}

async function carregar() {
  skeleton();

  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, status, total, criado_em, pedido_itens(quantidade, preco_unitario, produtos(nome, imagem_url))"
    )
    .order("criado_em", { ascending: false });

  if (error) {
    aviso.textContent = "Erro ao carregar seus pedidos.";
    aviso.classList.add("erro");
    lista.innerHTML = "";
    return;
  }

  if (!data || data.length === 0) {
    lista.innerHTML =
      "<li class='vazio'>Você ainda não fez nenhum resgate. <a href='/loja' class='link'>Ir para a loja</a></li>";
    return;
  }

  const caminhos = [
    ...new Set(
      data.flatMap((p) =>
        (p.pedido_itens ?? []).map((it) => it.produtos?.imagem_url).filter(Boolean)
      )
    ),
  ];
  const imgMap = {};
  await Promise.all(
    caminhos.map(async (c) => {
      imgMap[c] = await urlImagem(c);
    })
  );

  lista.innerHTML = data
    .map((p) => {
      const st = STATUS[p.status] || { label: p.status, classe: "" };
      const dataStr = new Date(p.criado_em).toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const itensHtml = (p.pedido_itens ?? [])
        .map((it) => {
          const img = it.produtos?.imagem_url ? imgMap[it.produtos.imagem_url] : null;
          return `
            <div class="pedido-item">
              <div class="pedido-item-thumb">${img ? `<img src="${img}" alt="" />` : '<i class="ph-fill ph-image"></i>'}</div>
              <span class="pedido-item-nome">${it.quantidade}× ${it.produtos?.nome || "Produto"}</span>
              <b>${it.preco_unitario} CRC</b>
            </div>`;
        })
        .join("");

      return `
        <li class="pedido-card">
          <div class="pedido-card-header">
            <strong>Pedido #${p.id.slice(0, 8)}</strong>
            <span class="${st.classe}" style="font-weight:700;font-size:11px;padding:5px 10px;border-radius:9999px;">${st.label}</span>
          </div>
          <div class="pedido-card-itens">${itensHtml}</div>
          <div class="pedido-card-footer">
            <span style="font-size:12px;color:var(--muted);">${dataStr}</span>
            <strong style="color:var(--orange);">Total: ${p.total} CRC</strong>
          </div>
        </li>`;
    })
    .join("");
}
