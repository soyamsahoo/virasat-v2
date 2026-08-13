/** Offline-first intake queue (IndexedDB).
 *
 * Field agents working in low-connectivity villages record artisan bio,
 * oral folklore audio and artwork photographs locally. Each completed
 * intake is persisted here and replayed against the API once the browser
 * regains connectivity.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface QueuedIntake {
  id: string;
  createdAt: string;
  payload: {
    artisan: {
      full_name: string;
      pehchan_card_id?: string;
      biography: string;
      region_id: string;
      primary_tradition_id: string;
      parent_artisan_id?: string;
    };
    story: {
      title: string;
      language: string;
      transcript: string;
      audio_data_url: string;
    } | null;
    artwork: {
      title: string;
      medium?: string;
      dimensions?: string;
      creation_year: number;
    };
    artwork_image_data_url: string | null;
  };
}

const DB_NAME = "virasat-offline";
const STORE = "intake";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueIntake(payload: QueuedIntake["payload"]): Promise<string> {
  const db = await openDb();
  const id = `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: QueuedIntake = { id, createdAt: new Date().toISOString(), payload };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

export async function listQueuedIntakes(): Promise<QueuedIntake[]> {
  const db = await openDb();
  const rows = await new Promise<QueuedIntake[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedIntake[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeIntake(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export interface SyncOutcome {
  ok: boolean;
  error?: string;
}

/** Replay a queued intake against the API. */
export async function syncIntake(
  intake: QueuedIntake,
  agentId: string,
  api: {
    artisans: {
      create: (p: QueuedIntake["payload"]["artisan"]) => Promise<{ id: string }>;
    };
    agents: {
      createStory: (
        agentId: string,
        payload: {
          artisan_id: string;
          title: string;
          audio_recording_url: string;
          transcript: string;
          language: string;
        },
      ) => Promise<unknown>;
    };
    artworks: { upload: (form: FormData) => Promise<unknown> };
  },
): Promise<SyncOutcome> {
  try {
    const artisan = await api.artisans.create(intake.payload.artisan);

    if (intake.payload.story) {
      await api.agents.createStory(agentId, {
        artisan_id: artisan.id,
        title: intake.payload.story.title,
        audio_recording_url: intake.payload.story.audio_data_url || "",
        transcript: intake.payload.story.transcript,
        language: intake.payload.story.language,
      });
    }

    if (intake.payload.artwork_image_data_url) {
      const blob = await (await fetch(intake.payload.artwork_image_data_url)).blob();
      const form = new FormData();
      form.append("file", blob, "artwork-capture.jpg");
      form.append("title", intake.payload.artwork.title);
      form.append("artisan_id", artisan.id);
      form.append("creation_year", String(intake.payload.artwork.creation_year));
      if (intake.payload.artwork.medium) form.append("medium", intake.payload.artwork.medium);
      if (intake.payload.artwork.dimensions) form.append("dimensions", intake.payload.artwork.dimensions);
      form.append("auto_passport", "true");
      await api.artworks.upload(form);
    }

    await removeIntake(intake.id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync failed" };
  }
}

/** React hook: queued count + auto-sync on regaining connectivity. */
export function useQueueSync(agentId: string | null) {
  const [queued, setQueued] = useState<QueuedIntake[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = useCallback(async () => {
    setQueued(await listQueuedIntakes());
  }, []);

  const syncAll = useCallback(async () => {
    if (!agentId || syncing) return;
    setSyncing(true);
    setLastSync(null);
    try {
      const pending = await listQueuedIntakes();
      if (pending.length === 0) {
        setLastSync({ ok: true, message: "Queue empty — everything already synced." });
        return;
      }
      let failed = 0;
      for (const intake of pending) {
        const outcome = await syncIntake(intake, agentId, api);
        if (!outcome.ok) failed++;
      }
      await refresh();
      setLastSync({
        ok: failed === 0,
        message: failed === 0
          ? `Synced ${pending.length} intake${pending.length > 1 ? "s" : ""}.`
          : `${pending.length - failed} synced, ${failed} still queued.`,
      });
    } finally {
      setSyncing(false);
    }
  }, [agentId, syncing, refresh]);

  useEffect(() => {
    void refresh();
    const onOnline = () => {
      if (navigator.onLine) void syncAll();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh, syncAll]);

  return { queued, syncing, syncAll, lastSync, refresh };
}