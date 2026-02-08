import { useEffect } from "react";
import { supabase } from "../services/supabase";

/**
 * Subscribe to real-time changes on the videos table.
 * Calls onUpdate when any row is inserted, updated, or deleted.
 */
export function useRealtimeVideos(onUpdate: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel("videos-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos" },
        () => {
          onUpdate();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}
