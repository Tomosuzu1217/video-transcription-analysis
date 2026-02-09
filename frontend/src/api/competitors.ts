import { getAll, put, del, update, generateId, STORES } from "../services/db";
import type { Competitor } from "../types";

export async function createCompetitor(data: {
  name: string;
  metrics: Record<string, number>;
  notes?: string;
}): Promise<Competitor> {
  const id = generateId();
  const record: Competitor = {
    id,
    name: data.name,
    metrics: data.metrics,
    notes: data.notes ?? null,
    created_at: new Date().toISOString(),
  };
  await put(STORES.COMPETITORS, record);
  return record;
}

export async function getCompetitors(): Promise<Competitor[]> {
  const all = await getAll<Competitor>(STORES.COMPETITORS);
  all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return all;
}

export async function updateCompetitor(
  id: number,
  data: Partial<Pick<Competitor, "name" | "metrics" | "notes">>,
): Promise<Competitor> {
  return update<Competitor>(STORES.COMPETITORS, id, data);
}

export async function deleteCompetitor(id: number): Promise<void> {
  await del(STORES.COMPETITORS, id);
}
