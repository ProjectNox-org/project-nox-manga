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

export async function homeData() {
  const [pop, recent, rank] = await Promise.all([
    json("/api/obras?sort=populares&limit=18"),
    json("/api/lancamentos?limit=12"),
    json("/api/ranking?tipo=xp&limit=5"),
  ]);
  const obras: Obra[] = (pop && (pop.itens || pop.items)) || [];
  return { obras, recentes: (recent && recent.itens) || [], ranking: (rank && rank.itens) || [] };
}
