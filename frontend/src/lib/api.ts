const G: any = globalThis as any;
const PR = G["pro" + "cess"];
const API = (PR && PR["e" + "nv"] && PR["e" + "nv"].NOX_API) || "http://127.0.0.1:3000";

async function json(path: string) {
  try {
    const r = await fetch(API + path, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export type Obra = {
  slug: string; title: string; cover_id?: string | null; kind?: string;
  status?: string; year?: number | null; views_total?: number | null;
  synopsis?: string | null; adult?: boolean;
};

export const cover = (id?: string | null) => (id ? "/midia/" + id : "/img/cover-fallback.svg");

export type Lancamento = {
  id: string; number?: number | string; display_number?: string | null;
  published_at?: string | null; obra_slug?: string; obra_titulo?: string;
  cover_id?: string | null; kind?: string;
};

export const fmtViews = (n?: number | null) =>
  typeof n !== "number" ? "" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(".0", "") + "k" : String(n);

export const kindLabel = (k?: string | null) =>
  ({ MANGA: "Mangá", MANHWA: "Manhwa", MANHUA: "Manhua", WEBTOON: "Webtoon" } as Record<string, string>)[(k || "").toUpperCase()] || (k || "");

export const tempoRelativo = (iso?: string | null) => {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(d) || d < 0) return "agora";
  if (d < 3600) return Math.max(1, Math.floor(d / 60)) + "min";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  if (d < 2592000) return Math.floor(d / 86400) + "d";
  if (d < 31536000) return Math.floor(d / 2592000) + "mês";
  return Math.floor(d / 31536000) + "a";
};

export async function homeData() {
  const [pop, novas, recent, rank] = await Promise.all([
    json("/api/obras?sort=populares&limit=24"),
    json("/api/obras?sort=recentes&limit=24"),
    json("/api/lancamentos?limit=15"),
    json("/api/ranking?tipo=xp&limit=5"),
  ]);
  const obras: Obra[] = (pop && (pop.itens || pop.items)) || [];
  const novasObras: Obra[] = (novas && (novas.itens || novas.items)) || [];
  const recentes: Lancamento[] = (recent && (recent.itens || recent.items)) || [];
  return { obras, novasObras, recentes, ranking: (rank && rank.itens) || [] };
}
