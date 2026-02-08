import { get, STORES } from "./db";
import type { ApiKeyStatus, SettingsRecord } from "../types";

const DEFAULT_COOLDOWN_MS = 60_000;

interface KeyEntry {
  key: string;
  index: number;
  state: "available" | "working" | "rate_limited" | "error";
  rateLimitedUntil: number;
  currentVideoId: number | null;
  completedCount: number;
}

export class KeyPool {
  private keys: KeyEntry[] = [];
  private model = "gemini-2.5-flash";

  async initialize(): Promise<void> {
    const record = await get<SettingsRecord>(STORES.SETTINGS, "app");
    if (record) {
      const apiKeys: string[] = record.api_keys ?? [];
      this.model = record.selected_model ?? "gemini-2.5-flash";
      this.keys = apiKeys.map((key, index) => ({
        key,
        index,
        state: "available" as const,
        rateLimitedUntil: 0,
        currentVideoId: null,
        completedCount: 0,
      }));
    }
  }

  getModel(): string {
    return this.model;
  }

  getKeyCount(): number {
    return this.keys.length;
  }

  acquire(videoId: number): { key: string; index: number } | null {
    const now = Date.now();
    for (const entry of this.keys) {
      if (entry.state === "rate_limited" && now >= entry.rateLimitedUntil) {
        entry.state = "available";
        entry.rateLimitedUntil = 0;
      }
    }
    const entry = this.keys.find((k) => k.state === "available");
    if (!entry) return null;
    entry.state = "working";
    entry.currentVideoId = videoId;
    return { key: entry.key, index: entry.index };
  }

  release(index: number): void {
    const entry = this.keys[index];
    if (!entry) return;
    entry.state = "available";
    entry.currentVideoId = null;
    entry.completedCount++;
  }

  markRateLimited(index: number, cooldownMs: number = DEFAULT_COOLDOWN_MS): void {
    const entry = this.keys[index];
    if (!entry) return;
    entry.state = "rate_limited";
    entry.rateLimitedUntil = Date.now() + cooldownMs;
    entry.currentVideoId = null;
  }

  markError(index: number): void {
    const entry = this.keys[index];
    if (!entry) return;
    entry.state = "error";
    entry.currentVideoId = null;
  }

  hasAvailableOrCoolingKeys(): boolean {
    return this.keys.some(
      (k) => k.state === "available" || k.state === "rate_limited",
    );
  }

  nextAvailableTime(): number | null {
    const rateLimited = this.keys.filter((k) => k.state === "rate_limited");
    if (rateLimited.length === 0) return null;
    return Math.min(...rateLimited.map((k) => k.rateLimitedUntil));
  }

  async waitForAvailable(): Promise<boolean> {
    const nextTime = this.nextAvailableTime();
    if (nextTime === null) return false;
    const waitMs = Math.max(0, nextTime - Date.now()) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return true;
  }

  getStatuses(): ApiKeyStatus[] {
    return this.keys.map((k) => ({
      index: k.index,
      state: k.state,
      rateLimitedUntil: k.state === "rate_limited" ? k.rateLimitedUntil : undefined,
      currentVideoId: k.currentVideoId ?? undefined,
      completedCount: k.completedCount,
    }));
  }
}
