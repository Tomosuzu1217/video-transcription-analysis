import { getAll, put, del, update, generateId, STORES } from "../services/db";
import { getConversions } from "./conversions";
import { getVideo } from "./videos";
import type { ABTest, ABTestResult } from "../types";

export async function createABTest(data: {
  name: string;
  video_a_id: number;
  video_b_id: number;
  target_metric: string;
  notes?: string;
}): Promise<ABTest> {
  const id = generateId();
  const record: ABTest = {
    id,
    name: data.name,
    video_a_id: data.video_a_id,
    video_b_id: data.video_b_id,
    target_metric: data.target_metric,
    status: "draft",
    notes: data.notes ?? null,
    created_at: new Date().toISOString(),
  };
  await put(STORES.AB_TESTS, record);
  return record;
}

export async function getABTests(): Promise<ABTest[]> {
  const all = await getAll<ABTest>(STORES.AB_TESTS);
  all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return all;
}

export async function updateABTest(
  id: number,
  data: Partial<Pick<ABTest, "name" | "status" | "notes" | "target_metric">>,
): Promise<ABTest> {
  return update<ABTest>(STORES.AB_TESTS, id, data);
}

export async function deleteABTest(id: number): Promise<void> {
  await del(STORES.AB_TESTS, id);
}

export async function getABTestResult(test: ABTest): Promise<ABTestResult> {
  const [videoA, videoB, convsA, convsB] = await Promise.all([
    getVideo(test.video_a_id),
    getVideo(test.video_b_id),
    getConversions(test.video_a_id),
    getConversions(test.video_b_id),
  ]);

  const valA = convsA.find((c) => c.metric_name === test.target_metric)?.metric_value ?? null;
  const valB = convsB.find((c) => c.metric_name === test.target_metric)?.metric_value ?? null;

  let lift: number | null = null;
  let zScore: number | null = null;
  let significant = false;

  if (valA !== null && valB !== null && valA !== 0) {
    lift = ((valB - valA) / Math.abs(valA)) * 100;

    // Simple z-test for proportions (treat values as rates if < 1, else as counts)
    const nA = valA;
    const nB = valB;
    const total = nA + nB;
    if (total > 0) {
      const p = total / 2; // pooled
      const se = Math.sqrt(Math.abs(p * (1 - p / total) * (2 / total)));
      if (se > 0) {
        zScore = Math.round(((nB - nA) / se) * 100) / 100;
        significant = Math.abs(zScore) > 1.96;
      }
    }
  }

  return {
    test,
    video_a_name: videoA.filename,
    video_b_name: videoB.filename,
    value_a: valA,
    value_b: valB,
    lift_percent: lift !== null ? Math.round(lift * 100) / 100 : null,
    z_score: zScore,
    significant,
  };
}
