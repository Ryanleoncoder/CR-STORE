import { supabase } from "./supabase.js";

export async function urlImagem(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("produtos").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function uploadImagem(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const caminho = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("produtos")
    .upload(caminho, file, { upsert: false });
  if (error) throw error;
  return caminho;
}
