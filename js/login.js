import { supabase } from "./supabase.js";

const abaEntrar = document.querySelector("#aba-entrar");
const abaPrimeiro = document.querySelector("#aba-primeiro");
const blocoEntrar = document.querySelector("#bloco-entrar");
const formEntrar = document.querySelector("#form-entrar");
const formMagico = document.querySelector("#form-magico");
const formPrimeiro = document.querySelector("#form-primeiro");
const aviso = document.querySelector("#aviso");

const mgEmail = document.querySelector("#mg-email");
const mgCodigo = document.querySelector("#mg-codigo");
let emailMagico = "";

const passoEmail = document.querySelector("#passo-email");
const passoCodigo = document.querySelector("#passo-codigo");
const passoSenha = document.querySelector("#passo-senha");

let emailPrimeiro = "";

supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = "loja.html";
});

// Retorno do link mágico
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session) {
    window.location.href = "loja.html";
  }
});

abaEntrar.addEventListener("click", () => trocarAba(true));
abaPrimeiro.addEventListener("click", () => trocarAba(false));

function trocarAba(entrar) {
  abaEntrar.classList.toggle("ativa", entrar);
  abaPrimeiro.classList.toggle("ativa", !entrar);
  blocoEntrar.hidden = !entrar;
  formPrimeiro.hidden = entrar;
  limparAviso();
}

function limparAviso() {
  aviso.textContent = "";
  aviso.classList.remove("erro");
}

function mostrarErro(msg) {
  aviso.textContent = msg;
  aviso.classList.add("erro");
}

formEntrar.addEventListener("submit", async (e) => {
  e.preventDefault();
  limparAviso();

  const { error } = await supabase.auth.signInWithPassword({
    email: document.querySelector("#email-entrar").value.trim(),
    password: document.querySelector("#senha-entrar").value,
  });

  if (error) return mostrarErro("E-mail ou senha inválidos.");
  window.location.href = "loja.html";
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

document.querySelector("#mg-enviar").addEventListener("click", async () => {
  limparAviso();
  emailMagico = document.querySelector("#email-magico").value.trim();
  if (!emailMagico) return mostrarErro("Informe o e-mail.");

  const { error } = await supabase.auth.signInWithOtp({
    email: emailMagico,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (error) return mostrarErro("Não foi possível enviar o e-mail.");

  mgEmail.hidden = true;
  mgCodigo.hidden = false;
  aviso.textContent = "Enviamos um e-mail! Clique no link OU digite o código abaixo.";
});

document.querySelector("#mg-validar").addEventListener("click", async () => {
  limparAviso();
  const codigo = document.querySelector("#mg-cod").value.trim();
  if (!codigo) return mostrarErro("Informe o código.");

  const { error } = await supabase.auth.verifyOtp({
    email: emailMagico,
    token: codigo,
    type: "email",
  });
  if (error) return mostrarErro("Código inválido ou expirado.");

  window.location.href = "loja.html";
});

const formPrimeiroAcesso = document.querySelector("#form-primeiro-acesso");
if (formPrimeiroAcesso) {
  formPrimeiroAcesso.addEventListener("submit", async (e) => {
    e.preventDefault();
    limparAviso();

    const email = document.querySelector("#email-primeiro").value.trim();
    const senha = document.querySelector("#nova-senha").value;
    const senha2 = document.querySelector("#nova-senha2").value;

    if (senha.length < 6) return mostrarErro("A senha precisa de ao menos 6 caracteres.");
    if (senha !== senha2) return mostrarErro("As senhas não conferem.");

    const res = await fetch("/api/primeiro-acesso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha }),
    });

    const dados = await res.json();
    if (!res.ok) return mostrarErro(dados.error || "Erro no cadastro.");

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email,
      password: senha,
    });

    if (loginError) return mostrarErro("Cadastro concluído! Por favor, faça login na aba Entrar.");
    window.location.href = "loja.html";
  });
}
