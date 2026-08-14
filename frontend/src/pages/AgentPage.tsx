import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AudioLines,
  Camera,
  Check,
  CloudOff,
  CloudUpload,
  Image,
  MapPin,
  Mic,
  Pause,
  Play,
  Radio,
  Save,
  Square,
  Trash2,
  UserRound,
  Wifi,
} from "lucide-react";
import { api } from "../lib/api";
import { checkBlur } from "../lib/blurCheck";
import { enqueueIntake, useQueueSync, type QueuedIntake } from "../lib/offlineQueue";
import { ArtworkPlate } from "../components/ArtworkPlate";
import { KeypointMatchInspector } from "../components/KeypointMatchInspector";
import { useDeepZoom } from "../components/DeepZoomModal";
import type { Artisan, FieldAgent, Region, Tradition, UploadResponse } from "../types";

const STEPS = ["Artisan Bio", "Oral Story", "Artwork Capture", "Review & Submit"] as const;

interface IntakeDraft {
  full_name: string;
  pehchan_card_id: string;
  biography: string;
  region_id: string;
  primary_tradition_id: string;
  parent_artisan_id: string;
  story_title: string;
  story_language: string;
  story_transcript: string;
  story_audio: string | null;
  artwork_title: string;
  artwork_medium: string;
  artwork_dimensions: string;
  artwork_year: number;
}

const emptyDraft: IntakeDraft = {
  full_name: "",
  pehchan_card_id: "",
  biography: "",
  region_id: "",
  primary_tradition_id: "",
  parent_artisan_id: "",
  story_title: "",
  story_language: "Odia",
  story_transcript: "",
  story_audio: null,
  artwork_title: "",
  artwork_medium: "",
  artwork_dimensions: "",
  artwork_year: new Date().getFullYear(),
};

const AGENT_KEY = "virasat-agent-v1";

export function AgentPage() {
  const [agent, setAgent] = useState<FieldAgent | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [traditions, setTraditions] = useState<Tradition[]>([]);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<IntakeDraft>(emptyDraft);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [blur, setBlur] = useState<{ score: number; pass: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [queuedId, setQueuedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const deepZoom = useDeepZoom();
  const { queued, syncing, syncAll, lastSync } = useQueueSync(agent?.id ?? null);

  useEffect(() => {
    void api.regions.list().then(setRegions).catch(() => undefined);
    void api.traditions.list().then(setTraditions).catch(() => undefined);
    void api.artisans.list().then(setArtisans).catch(() => undefined);
    const stored = localStorage.getItem(AGENT_KEY);
    if (stored) {
      try {
        setAgent(JSON.parse(stored) as FieldAgent);
      } catch {
        localStorage.removeItem(AGENT_KEY);
      }
    }
    const onStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", onStatus);
    window.addEventListener("offline", onStatus);
    return () => {
      window.removeEventListener("online", onStatus);
      window.removeEventListener("offline", onStatus);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const patch = (fields: Partial<IntakeDraft>) => setDraft((d) => ({ ...d, ...fields }));

  /* ------------------------------------------------------------- capture */
  async function onPickPhoto(file: File) {
    const url = URL.createObjectURL(file);
    setPhoto({ blob: file, url, name: file.name });
    setBlur(null);
    try {
      const report = await checkBlur(file);
      setBlur(report);
    } catch {
      setBlur({ score: 0, pass: false });
    }
  }

  function openImagePicker(source: "camera" | "gallery") {
    setShowImagePicker(false);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (source === "camera") {
      input.capture = "environment";
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) void onPickPhoto(file);
    };
    input.click();
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice("Audio recording unsupported on this device — transcript only.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => patch({ story_audio: String(reader.result) });
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setRecordingPaused(false);
      };
      recorder.start();
      mediaRef.current = recorder;
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      setNotice("Microphone access denied.");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  /* ------------------------------------------------------------ submit */
  async function submit() {
    setSubmitting(true);
    setNotice(null);
    try {
      if (navigator.onLine) {
        const artisan = await api.artisans.create({
          full_name: draft.full_name,
          pehchan_card_id: draft.pehchan_card_id || undefined,
          biography: draft.biography,
          region_id: draft.region_id,
          primary_tradition_id: draft.primary_tradition_id,
          parent_artisan_id: draft.parent_artisan_id || undefined,
        });

        if (draft.story_title && draft.story_transcript) {
          await api.agents.createStory(agent!.id, {
            artisan_id: artisan.id,
            title: draft.story_title,
            audio_recording_url: draft.story_audio ?? "",
            transcript: draft.story_transcript,
            language: draft.story_language,
          });
        }

        if (photo) {
          const form = new FormData();
          form.append("file", photo.blob, photo.name || "artwork-capture.jpg");
          form.append("title", draft.artwork_title);
          form.append("artisan_id", artisan.id);
          form.append("creation_year", String(draft.artwork_year));
          form.append("medium", draft.artwork_medium);
          form.append("dimensions", draft.artwork_dimensions);
          form.append("auto_passport", "true");
          console.log("[Agent] Uploading artwork:", draft.artwork_title, "with image:", photo.name);
          const response = await api.artworks.upload(form);
          console.log("[Agent] Upload response:", response);
          setResult(response);
        } else {
          setNotice(`Artisan ${artisan.full_name} onboarded. (No photograph attached.)`);
        }
        resetWizard();
      } else {
        const id = await enqueueIntake({
          artisan: {
            full_name: draft.full_name,
            pehchan_card_id: draft.pehchan_card_id || undefined,
            biography: draft.biography,
            region_id: draft.region_id,
            primary_tradition_id: draft.primary_tradition_id,
            parent_artisan_id: draft.parent_artisan_id || undefined,
          },
          story: draft.story_title
            ? {
                title: draft.story_title,
                language: draft.story_language,
                transcript: draft.story_transcript,
                audio_data_url: draft.story_audio ?? "",
              }
            : null,
          artwork: {
            title: draft.artwork_title,
            medium: draft.artwork_medium || undefined,
            dimensions: draft.artwork_dimensions || undefined,
            creation_year: draft.artwork_year,
          },
          artwork_image_data_url: photo?.url ?? null,
        });
        setQueuedId(id);
        resetWizard();
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetWizard() {
    setDraft(emptyDraft);
    setStep(0);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setBlur(null);
  }

  const stepValid = (() => {
    switch (step) {
      case 0:
        return draft.full_name.trim().length > 1 && draft.biography.trim().length >= 20
          && draft.region_id && draft.primary_tradition_id;
      case 1:
        return true;
      case 2:
        return draft.artwork_title.trim().length > 1;
      default:
        return true;
    }
  })();

  /* ------------------------------------------------------------- gate */
  if (!agent) {
    return <AgentGate regions={regions} onEnter={setAgent} />;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 pb-28 pt-32">
      <div className={`mb-8 flex items-center justify-between rounded-sm border px-5 py-3 ${online ? "border-museum-emerald/60 bg-museum-emerald/10" : "border-[#C97B3D]/60 bg-[#3A2409]/30"}`}>
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-museum-parchment/80">
          {online ? <Wifi size={14} className="text-[#7FBF94]" /> : <CloudOff size={14} className="text-[#E0A96D]" />}
          {online ? "Online — submissions sync live" : "Offline — intakes queue on this device"}
        </p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-museum-parchment/55">
          {agent.full_name} · {agent.ngo_organization} · {agent.badge_number}
        </p>
      </div>

      {queued.length > 0 && (
        <div className="mb-8 rounded-sm border border-museum-gold/40 bg-museum-gold/10 p-5">
          <p className="eyebrow flex items-center gap-2 text-museum-gold">
            <CloudUpload size={14} /> Offline queue — {queued.length} intake{queued.length > 1 ? "s" : ""} awaiting sync
          </p>
          <p className="mt-2 text-xs leading-relaxed text-museum-parchment/65">
            Queued intakes replay automatically when connectivity returns.
          </p>
          <button
            onClick={() => void syncAll()}
            disabled={syncing || !online}
            className="mt-3 rounded-sm border border-museum-gold/70 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-museum-gold transition-colors hover:bg-museum-gold hover:text-museum-black disabled:opacity-40"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {lastSync && (
            <p className={`mt-2 text-[11px] ${lastSync.ok ? "text-[#7FBF94]" : "text-[#E05C4B]"}`}>
              {lastSync.message}
            </p>
          )}
        </div>
      )}

      {queuedId && (
        <div className="mb-8 rounded-sm border border-museum-emerald/60 bg-museum-emerald/15 p-5">
          <p className="eyebrow flex items-center gap-2 text-[#7FBF94]">
            <Check size={14} /> Intake queued offline
          </p>
          <p className="mt-2 text-xs leading-relaxed text-museum-parchment/65">
            Ref <span className="font-display tracking-wider text-museum-gold">{queuedId}</span> is safe in
            local storage. The artifact will be registered with a heritage passport automatically after sync.
          </p>
        </div>
      )}

      {result && (
        <div className="mb-8 space-y-6">
          <div className="rounded-sm border border-museum-emerald/60 bg-museum-emerald/15 p-5">
            <p className="eyebrow flex items-center gap-2 text-[#7FBF94]">
              <Check size={14} /> Artwork registered & fingerprinted
            </p>
            <p className="mt-2 font-display text-2xl tracking-widest text-museum-gold">
              {result.heritage_id}
            </p>
            <p className="mt-1 text-xs text-museum-parchment/60">
              {result.title} · {result.artisan_name} · Blur score {result.image_quality.blur_score.toFixed(1)}
              {" · "}{result.passport ? "Passport issued" : "Passport available on request"}
            </p>
          </div>

          {result.possible_duplicates.filter((d) => d.keypoint_pairs.length > 0).length > 0 && (
            <KeypointMatchInspector
              leftImage={photo?.url ?? null}
              leftLabel="Field capture"
              match={result.possible_duplicates.find((d) => d.keypoint_pairs.length > 0)!}
            />
          )}
        </div>
      )}

      {notice && (
        <p className="mb-6 rounded-sm border border-museum-gold/40 bg-museum-black/50 p-4 text-sm text-museum-parchment/80">
          {notice}
        </p>
      )}

      {/* -------------------------------------------------- stepper */}
      <div className="mb-10 grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i)}
            className={`rounded-sm border px-2 py-3 text-center transition-colors ${
              i === step
                ? "border-museum-gold bg-museum-gold text-museum-black"
                : i < step
                  ? "border-museum-emerald/60 text-[#7FBF94]"
                  : "border-museum-parchment/15 text-museum-parchment/45"
            }`}
          >
            <span className="block text-[9px] uppercase tracking-[0.2em]">
              {i + 1} · {label}
            </span>
          </button>
        ))}
      </div>

      {step === 0 && (
        <section className="rounded-sm hairline p-6">
          <p className="eyebrow flex items-center gap-2 text-museum-gold">
            <UserRound size={14} /> Step 1 — Artisan Bio
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Full name" required>
              <input value={draft.full_name} onChange={(e) => patch({ full_name: e.target.value })} className={inputCls} placeholder="e.g. Rama Maharana" />
            </Field>
            <Field label="Pehchan Card ID">
              <input value={draft.pehchan_card_id} onChange={(e) => patch({ pehchan_card_id: e.target.value })} className={inputCls} placeholder="PCH-OD-xxxxx (optional)" />
            </Field>
            <Field label="Heritage village" required>
              <select value={draft.region_id} onChange={(e) => patch({ region_id: e.target.value })} className={inputCls}>
                <option value="">Select region…</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.village} — {r.district}, {r.state}</option>
                ))}
              </select>
            </Field>
            <Field label="Tradition" required>
              <select value={draft.primary_tradition_id} onChange={(e) => patch({ primary_tradition_id: e.target.value })} className={inputCls}>
                <option value="">Select tradition…</option>
                {traditions.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </Field>
            <Field label="Master / parent artisan">
              <select value={draft.parent_artisan_id} onChange={(e) => patch({ parent_artisan_id: e.target.value })} className={inputCls}>
                <option value="">None (founder of a new line)</option>
                {artisans.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name} · Generation {a.generation_number}</option>
                ))}
              </select>
            </Field>
            <Field label="Biography (min 20 chars)" required>
              <textarea value={draft.biography} onChange={(e) => patch({ biography: e.target.value })} className={`${inputCls} min-h-[96px] resize-y`} placeholder="Family craft history, training, specialisations…" />
            </Field>
          </div>
          <p className="mt-5 text-[11px] text-museum-parchment/45">
            <MapPin size={11} className="mr-1 inline" />
            Generation number is derived automatically from the selected master.
          </p>
        </section>
      )}

      {step === 1 && (
        <section className="rounded-sm hairline p-6">
          <p className="eyebrow flex items-center gap-2 text-museum-gold">
            <AudioLines size={14} /> Step 2 — Oral Story
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Story title">
              <input value={draft.story_title} onChange={(e) => patch({ story_title: e.target.value })} className={inputCls} placeholder="e.g. The grandmother's festival patta" />
            </Field>
            <Field label="Language">
              <input value={draft.story_language} onChange={(e) => patch({ story_language: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <div className="mt-6 rounded-sm border border-museum-parchment/15 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-museum-parchment/50">
              Field audio recorder — spoken folklore, song, memory
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {!recording ? (
                <button
                  onClick={() => void startRecording()}
                  className="flex items-center gap-2 rounded-full border border-museum-gold/70 px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-museum-gold hover:bg-museum-gold hover:text-museum-black"
                >
                  <Mic size={14} /> {draft.story_audio ? "Re-record" : "Start recording"}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (recordingPaused) mediaRef.current?.resume();
                      else mediaRef.current?.pause();
                      setRecordingPaused((v) => !v);
                    }}
                    className="flex items-center gap-2 rounded-full border border-museum-gold/70 px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-museum-gold"
                  >
                    {recordingPaused ? <Play size={14} /> : <Pause size={14} />} {recordingPaused ? "Resume" : "Pause"}
                  </button>
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 rounded-full bg-[#C0392B] px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-white"
                  >
                    <Square size={13} /> Stop & save
                  </button>
                </>
              )}
              {recording && (
                <span className="flex items-center gap-2 text-xs text-museum-parchment/70">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#E05C4B]" />
                  {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
                </span>
              )}
              {draft.story_audio && !recording && (
                <audio controls src={draft.story_audio} className="h-9 w-64" />
              )}
            </div>
          </div>

          <div className="mt-5">
            <Field label="Live transcript / notes">
              <textarea value={draft.story_transcript} onChange={(e) => patch({ story_transcript: e.target.value })} className={`${inputCls} min-h-[120px] resize-y`} placeholder="What is being sung or told, in the artisan's own words…" />
            </Field>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-sm hairline p-6">
          <p className="eyebrow flex items-center gap-2 text-museum-gold">
            <Camera size={14} /> Step 3 — Artwork Capture
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Artwork title" required>
              <input value={draft.artwork_title} onChange={(e) => patch({ artwork_title: e.target.value })} className={inputCls} placeholder="e.g. Rukmini Patta" />
            </Field>
            <Field label="Creation year" required>
              <input type="number" min={1000} max={2100} value={draft.artwork_year} onChange={(e) => patch({ artwork_year: Number(e.target.value) || 2026 })} className={inputCls} />
            </Field>
            <Field label="Medium">
              <input value={draft.artwork_medium} onChange={(e) => patch({ artwork_medium: e.target.value })} className={inputCls} placeholder="Cotton Patta, mineral pigments…" />
            </Field>
            <Field label="Dimensions">
              <input value={draft.artwork_dimensions} onChange={(e) => patch({ artwork_dimensions: e.target.value })} className={inputCls} placeholder="e.g. 12 x 9 in" />
            </Field>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-museum-parchment/50">
                Photograph — flat, even light, camera steady
              </p>
              <button
                onClick={() => setShowImagePicker(true)}
                className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-museum-gold/50 p-6 text-center w-full transition-colors hover:border-museum-gold"
              >
                <Camera size={22} className="text-museum-gold" />
                <span className="text-xs uppercase tracking-[0.2em] text-museum-parchment/70">
                  {photo ? "Replace photo" : "Capture / choose photo"}
                </span>
              </button>
              {blur && (
                <div className={`mt-3 rounded-sm border p-3 text-xs ${blur.pass ? "border-museum-emerald/60 text-[#7FBF94]" : "border-[#C0392B]/60 text-[#E05C4B]"}`}>
                  Local quality pre-check: Laplacian variance{" "}
                  <b className="font-display">{blur.score.toFixed(1)}</b> —{" "}
                  {blur.pass ? "passes the sharpness gate" : "blurry; re-capture with a steady camera"}
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-museum-parchment/50">Preview</p>
              <div className="mt-3">
                {photo ? (
                  <button onClick={() => deepZoom.open({ src: photo.url, title: draft.artwork_title || "Field capture" })} className="block w-full text-left">
                    <ArtworkPlate src={photo.url} title={draft.artwork_title || "Field capture"} className="h-56 w-full rounded-sm" />
                    <span className="mt-1 block text-[9px] uppercase tracking-[0.2em] text-museum-parchment/40">
                      Tap to open deep-zoom inspector
                    </span>
                  </button>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-sm border border-museum-parchment/10 font-serif text-sm italic text-museum-parchment/40">
                    No capture yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-sm hairline p-6">
          <p className="eyebrow flex items-center gap-2 text-museum-gold">
            <Radio size={14} /> Step 4 — Review & Submit
          </p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ["Artisan", draft.full_name || "—"],
              ["Pehchan ID", draft.pehchan_card_id || "—"],
              ["Tradition", traditions.find((t) => t.id === draft.primary_tradition_id)?.title ?? "—"],
              ["Region", regions.find((r) => r.id === draft.region_id)?.village ?? "—"],
              ["Story", draft.story_title || "—"],
              ["Audio clip", draft.story_audio ? "recorded" : "none"],
              ["Artwork", draft.artwork_title || "—"],
              ["Photo", photo ? `${(photo.blob.size / 1024).toFixed(0)} KB` : "none"],
              ["Blur gate", blur ? (blur.pass ? `pass (${blur.score.toFixed(0)})` : `fail (${blur.score.toFixed(0)})`) : "not checked"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-museum-parchment/10 pb-2">
                <dt className="text-[10px] uppercase tracking-[0.2em] text-museum-parchment/45">{k}</dt>
                <dd className="text-right text-sm text-museum-parchment/85">{v}</dd>
              </div>
            ))}
          </dl>
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-sm bg-museum-gold px-6 py-4 text-xs uppercase tracking-[0.24em] text-museum-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              "Submitting…"
            ) : online ? (
              <>
                <CloudUpload size={16} /> Register artisan, story & artwork
              </>
            ) : (
              <>
                <Save size={16} /> Save to offline queue
              </>
            )}
          </button>
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-museum-parchment/40">
            {online
              ? "Live registration with CV fingerprinting + automatic heritage passport"
              : "Stored on this device; synced automatically when signal returns"}
          </p>
        </section>
      )}

      {/* Image picker modal */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowImagePicker(false)}>
          <div className="bg-museum-black rounded-sm border border-museum-gold/30 p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-medium text-museum-parchment mb-4">Select image source</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => openImagePicker("camera")}
                className="flex flex-col items-center gap-2 rounded-sm border border-museum-gold/50 p-4 text-center transition-colors hover:border-museum-gold hover:bg-museum-gold/10"
              >
                <Camera size={28} className="text-museum-gold" />
                <span className="text-xs uppercase tracking-[0.2em] text-museum-parchment">Camera</span>
              </button>
              <button
                onClick={() => openImagePicker("gallery")}
                className="flex flex-col items-center gap-2 rounded-sm border border-museum-gold/50 p-4 text-center transition-colors hover:border-museum-gold hover:bg-museum-gold/10"
              >
                <Image size={28} className="text-museum-gold" />
                <span className="text-xs uppercase tracking-[0.2em] text-museum-parchment">Gallery</span>
              </button>
            </div>
            <button
              onClick={() => setShowImagePicker(false)}
              className="mt-4 w-full rounded-sm border border-museum-parchment/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-museum-parchment/70 hover:border-museum-gold hover:text-museum-gold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-10 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-sm border border-museum-parchment/25 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-museum-parchment/70 hover:border-museum-gold hover:text-museum-gold disabled:opacity-30"
        >
          ← Back
        </button>
        {step < 3 && (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid}
            className="rounded-sm bg-museum-gold px-8 py-3 text-[10px] uppercase tracking-[0.22em] text-museum-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Continue →
          </button>
        )}
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-sm border border-museum-parchment/20 bg-museum-black/60 px-4 py-3 text-sm text-museum-parchment placeholder:text-museum-parchment/30 focus:border-museum-gold focus:outline-none";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-museum-parchment/55">
        {label} {required && <span className="text-museum-gold">*</span>}
      </span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------- agent gate */
function AgentGate({ regions, onEnter }: { regions: Region[]; onEnter: (agent: FieldAgent) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [badge, setBadge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", ngo_organization: "", badge_number: "", assigned_region_id: "" });

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const agent = await api.agents.getByBadge(badge.trim());
      localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
      onEnter(agent);
    } catch {
      setError("Badge not found. Register this agent to continue.");
      setMode("register");
    } finally {
      setBusy(false);
    }
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const agent = await api.agents.register(form);
      localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
      onEnter(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 pb-28 pt-36">
      <div className="rounded-sm hairline p-8">
        <p className="eyebrow text-museum-gold">Field Agent Portal</p>
        <h1 className="mt-3 font-display text-3xl text-museum-parchment">
          {mode === "login" ? "Badge sign-in" : "Register field agent"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-museum-parchment/60">
          NGO field agents onboard rural artisans, record oral folklore and capture artwork
          photographs — online or offline, from the village itself.
        </p>

        {mode === "login" ? (
          <form onSubmit={login} className="mt-8 space-y-4">
            <input
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
              placeholder="Badge number — e.g. RHC-001"
              className={inputCls}
            />
            <button
              disabled={busy || !badge.trim()}
              className="w-full rounded-sm bg-museum-gold py-3.5 text-xs uppercase tracking-[0.24em] text-museum-black disabled:opacity-40"
            >
              {busy ? "Checking…" : "Enter the field"}
            </button>
            {error && <p className="text-xs text-[#E05C4B]">{error}</p>}
            <p className="text-center text-[11px] text-museum-parchment/45">
              New to the programme?{" "}
              <button type="button" onClick={() => { setMode("register"); setError(null); }} className="text-museum-gold hover:underline">
                Register an agent
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={register} className="mt-8 space-y-4">
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Full name"
              className={inputCls}
            />
            <input
              value={form.ngo_organization}
              onChange={(e) => setForm({ ...form, ngo_organization: e.target.value })}
              placeholder="NGO organisation"
              className={inputCls}
            />
            <select
              value={form.assigned_region_id}
              onChange={(e) => setForm({ ...form, assigned_region_id: e.target.value })}
              className={inputCls}
            >
              <option value="">Assigned region…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.village} — {r.state}</option>
              ))}
            </select>
            <input
              value={form.badge_number}
              onChange={(e) => setForm({ ...form, badge_number: e.target.value })}
              placeholder="Badge number (unique)"
              className={inputCls}
            />
            <button
              disabled={busy || !form.full_name || !form.ngo_organization || !form.assigned_region_id || !form.badge_number}
              className="w-full rounded-sm bg-museum-gold py-3.5 text-xs uppercase tracking-[0.24em] text-museum-black disabled:opacity-40"
            >
              {busy ? "Registering…" : "Register & enter"}
            </button>
            {error && <p className="text-xs text-[#E05C4B]">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
