export async function comLoading(btn, texto, fn) {
  const original = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.dataset.loading = "1";
    btn.innerHTML = texto;
  }
  try {
    return await fn();
  } finally {
    if (btn) {
      btn.disabled = false;
      delete btn.dataset.loading;
      btn.innerHTML = original;
    }
  }
}
