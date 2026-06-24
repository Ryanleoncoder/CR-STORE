import { setAccessToken, getAccessToken } from "./auth-token.js";
import { comLoading } from "./ui.js";

const abaEntrar = document.querySelector("#aba-entrar");
const abaPrimeiro = document.querySelector("#aba-primeiro");
const blocoEntrar = document.querySelector("#bloco-entrar");
const formEntrar = document.querySelector("#form-entrar");
const formMagico = document.querySelector("#form-magico");
const formPrimeiro = document.querySelector("#form-primeiro");
const aviso = document.querySelector("#aviso");
const avisoEntrar = document.querySelector("#aviso-entrar");
const avisoMagico = document.querySelector("#aviso-magico");
const TODOS_AVISOS = [aviso, avisoEntrar, avisoMagico];

const mgEmail = document.querySelector("#mg-email");
const mgCodigo = document.querySelector("#mg-codigo");
let emailMagico = "";

const JSON_HEADERS = { "Content-Type": "application/json" };

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function erroCampo(input, msg) {
  if (!input) return;
  input.classList.add("input-erro");
  const field = input.closest(".field") || input.parentElement;
  let slot = field.querySelector(".campo-erro");
  if (!slot) {
    slot = document.createElement("span");
    slot.className = "campo-erro";
    field.appendChild(slot);
  }
  slot.textContent = msg;
  input.focus();
}
function limparErroCampo(input) {
  if (!input) return;
  input.classList.remove("input-erro");
  const field = input.closest(".field") || input.parentElement;
  const slot = field && field.querySelector(".campo-erro");
  if (slot) slot.remove();
}
["#email-entrar", "#email-magico", "#email-primeiro"].forEach((sel) => {
  const inp = document.querySelector(sel);
  if (inp) inp.addEventListener("input", () => limparErroCampo(inp));
});


function destinoPosLogin() {
  const r = new URLSearchParams(location.search).get("redirect");
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/loja";
}

function concluirLogin(dados) {
  setAccessToken(dados.access_token, dados.expires_at);
  window.location.href = destinoPosLogin();
}

function revelar() {
  document.body.classList.add("pronto");
}


setTimeout(revelar, 3000);


(async () => {
  if (tratarErroDeLink()) return revelar();

  const retorno = await tratarRetornoDoLink();
  if (retorno === "ok") return;
  if (retorno === "erro") return revelar();

  const token = await getAccessToken();
  if (token) {
    window.location.href = destinoPosLogin();
    return;
  }
  revelar();
})();

abaEntrar.addEventListener("click", () => trocarAba(true));
abaPrimeiro.addEventListener("click", () => trocarAba(false));


function tratarErroDeLink() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const erro = params.get("error_code") || params.get("error");
  if (!erro) return false;

  const mensagens = {
    otp_expired: "Esse link expirou ou já foi usado. Peça um novo abaixo.",
    access_denied: "Não foi possível validar o link. Peça um novo abaixo.",
  };

  history.replaceState(null, "", window.location.pathname);
  document.querySelector("#toggle-magico").click();
  mostrarErro(mensagens[erro] || "Não foi possível entrar. Tente novamente.");
  return true;
}


async function tratarRetornoDoLink() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const refresh = params.get("refresh_token");
  if (!refresh) return false;

  history.replaceState(null, "", window.location.pathname + window.location.search);

  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    mostrarErro("Não foi possível concluir o login. Peça um novo link.");
    return "erro";
  }
  concluirLogin(await res.json());
  return "ok";
}

function trocarAba(entrar) {
  abaEntrar.classList.toggle("ativa", entrar);
  abaPrimeiro.classList.toggle("ativa", !entrar);
  blocoEntrar.hidden = !entrar;
  formPrimeiro.hidden = entrar;
  limparAviso();
}

function limparAviso() {
  TODOS_AVISOS.forEach((a) => {
    if (a) {
      a.textContent = "";
      a.classList.remove("erro");
    }
  });
}

// Mostra erro perto da ação (alvo) ou no aviso global, se nenhum alvo for dado.
function mostrarErro(msg, alvo = aviso) {
  (alvo || aviso).textContent = msg;
  (alvo || aviso).classList.add("erro");
}

formEntrar.addEventListener("submit", async (e) => {
  e.preventDefault();
  limparAviso();

  const emailInput = document.querySelector("#email-entrar");
  const email = emailInput.value.trim();
  if (!emailValido(email)) return erroCampo(emailInput, "Digite um e-mail válido.");

  await comLoading(e.submitter, "Entrando…", async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email,
        password: document.querySelector("#senha-entrar").value,
      }),
    });
    const dados = await res.json();
    if (!res.ok) return mostrarErro(dados.error || "E-mail ou senha inválidos.", avisoEntrar);
    concluirLogin(dados);
  });
});

document.querySelector("#toggle-magico").addEventListener("click", () => {
  limparAviso();
  const usandoMagico = formMagico.hidden;
  formEntrar.hidden = usandoMagico;
  formMagico.hidden = !usandoMagico;
  document.querySelector("#toggle-magico").innerHTML = usandoMagico
    ? '<i class="ph-fill ph-key"></i> Entrar com senha'
    : '<i class="ph-fill ph-magic-wand"></i> Entrar sem senha';
});

document.querySelector("#mg-enviar").addEventListener("click", async (e) => {
  limparAviso();
  const emailMagicoInput = document.querySelector("#email-magico");
  emailMagico = emailMagicoInput.value.trim();
  if (!emailValido(emailMagico)) return erroCampo(emailMagicoInput, "Digite um e-mail válido.");

  await comLoading(e.currentTarget, "Enviando…", async () => {
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email: emailMagico,
        redirectTo: `${window.location.origin}/`,
      }),
    });
    if (!res.ok) return mostrarErro("Não foi possível enviar o e-mail.", avisoMagico);

    mgEmail.hidden = true;
    mgCodigo.hidden = false;
    avisoMagico.textContent = "Enviamos um e-mail! Clique no link OU digite o código abaixo.";
  });
});

document.querySelector("#mg-validar").addEventListener("click", async (e) => {
  limparAviso();
  const codigo = document.querySelector("#mg-cod").value.trim();
  if (!codigo) return mostrarErro("Informe o código.");

  await comLoading(e.currentTarget, "Validando…", async () => {
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: emailMagico, token: codigo }),
    });
    const dados = await res.json();
    if (!res.ok) return mostrarErro(dados.error || "Código inválido ou expirado.", avisoMagico);
    concluirLogin(dados);
  });
});

const formPrimeiroAcesso = document.querySelector("#form-primeiro-acesso");
if (formPrimeiroAcesso) {
  const paPasso1 = document.querySelector("#pa-passo1");
  const paPasso2 = document.querySelector("#pa-passo2");
  const campoNome = document.querySelector("#campo-nome");
  const campoUsername = document.querySelector("#campo-username");
  const inputNome = document.querySelector("#nome-primeiro");
  const inputUsername = document.querySelector("#username-primeiro");
  let etapa = 1;

  function abrirPasso2(precisaNome, precisaUsername) {
    campoNome.hidden = !precisaNome;
    inputNome.required = precisaNome;
    campoUsername.hidden = !precisaUsername;
    inputUsername.required = precisaUsername;
    paPasso1.hidden = true;
    paPasso2.hidden = false;
    etapa = 2;
  }

  async function criarConta(email, senha) {
    const res = await fetch("/api/primeiro-acesso", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email,
        password: senha,
        nome: inputNome.value.trim(),
        username: inputUsername.value.trim(),
      }),
    });
    const dados = await res.json();
    if (!res.ok) {
      if (dados.precisaNome || dados.precisaUsername) abrirPasso2(dados.precisaNome, dados.precisaUsername);
      return mostrarErro(dados.error || "Erro no cadastro.");
    }

    const resLogin = await fetch("/api/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email, password: senha }),
    });
    if (!resLogin.ok) {
      return mostrarErro("Cadastro concluído! Por favor, faça login na aba Entrar.");
    }
    concluirLogin(await resLogin.json());
  }

  formPrimeiroAcesso.addEventListener("submit", async (e) => {
    e.preventDefault();
    limparAviso();

    const emailInput = document.querySelector("#email-primeiro");
    const email = emailInput.value.trim();
    const senha = document.querySelector("#nova-senha").value;
    const senha2 = document.querySelector("#nova-senha2").value;

    if (!emailValido(email)) return erroCampo(emailInput, "Digite um e-mail válido.");
    if (senha.length < 6) return mostrarErro("A senha precisa de ao menos 6 caracteres.");
    if (senha !== senha2) return mostrarErro("As senhas não conferem.");

    await comLoading(e.submitter, "Aguarde…", async () => {
      if (etapa === 1) {
        try {
          const res = await fetch(`/api/primeiro-acesso?email=${encodeURIComponent(email)}`);
          const { precisaNome, precisaUsername } = await res.json();
          if (precisaNome || precisaUsername) return abrirPasso2(precisaNome, precisaUsername);
        } catch {}
      }
      await criarConta(email, senha);
    });
  });
}
