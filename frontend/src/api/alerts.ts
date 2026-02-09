import { getAll, put, del, update, generateId, STORES } from "../services/db";
import type { Alert, TriggeredAlert, Conversion } from "../types";

export async function createAlert(data: {
  metric_name: string;
  condition: "above" | "below";
  threshold: number;
  video_id?: number | null;
}): Promise<Alert> {
  const id = generateId();
  const record: Alert = {
    id,
    metric_name: data.metric_name,
    condition: data.condition,
    threshold: data.threshold,
    video_id: data.video_id ?? null,
    enabled: true,
    created_at: new Date().toISOString(),
  };
  await put(STORES.ALERTS, record);
  return record;
}

export async function getAlerts(): Promise<Alert[]> {
  const all = await getAll<Alert>(STORES.ALERTS);
  all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return all;
}

export async function updateAlert(
  id: number,
  data: Partial<Pick<Alert, "metric_name" | "condition" | "threshold" | "video_id" | "enabled">>,
): Promise<Alert> {
  return update<Alert>(STORES.ALERTS, id, data);
}

export async function deleteAlert(id: number): Promise<void> {
  await del(STORES.ALERTS, id);
}

export async function checkAlerts(): Promise<TriggeredAlert[]> {
  const [alerts, conversions, videos] = await Promise.all([
    getAll<Alert>(STORES.ALERTS),
    getAll<Conversion>(STORES.CONVERSIONS),
    getAll<{ id: number; filename: string }>(STORES.VIDEOS),
  ]);

  const videoNames = new Map(videos.map((v) => [v.id, v.filename]));
  const triggered: TriggeredAlert[] = [];

  for (const alert of alerts) {
    if (!alert.enabled) continue;

    // Filter conversions matching this alert
    const matching = conversions.filter((c) => {
      if (c.metric_name !== alert.metric_name) return false;
      if (alert.video_id !== null && c.video_id !== alert.video_id) return false;
      return true;
    });

    for (const conv of matching) {
      const isTrigger =
        (alert.condition === "above" && conv.metric_value > alert.threshold) ||
        (alert.condition === "below" && conv.metric_value < alert.threshold);

      if (isTrigger) {
        triggered.push({
          ...alert,
          current_value: conv.metric_value,
          video_filename: videoNames.get(conv.video_id) ?? `Video #${conv.video_id}`,
        });
      }
    }
  }

  return triggered;
}
