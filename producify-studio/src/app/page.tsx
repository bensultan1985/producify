"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { defaultPattern } from "@/lib/defaultPattern";
import { Pattern, STEPS, Track, TrackId } from "@/lib/types";
import { createAudioEngine } from "@/lib/audioEngine";
import { patternToMidi, midiToBase64, sequencesToMidi } from "@/lib/midiExport";
import { saveAs } from "file-saver";
import { PianoRoll } from "@/components/PianoRoll";

const STORAGE_KEY = "producify_projects_v1";
const MAX_SEQUENCES = 16;
const MAX_TOTAL_UNITS = 64; // 8-step sequences

const SEQUENCE_COLORS = [
  "#22d3ee", // cyan
  "#f97316", // orange
  "#a855f7", // purple
  "#22c55e", // green
  "#e11d48", // rose
  "#14b8a6", // teal
  "#facc15", // yellow
  "#ec4899", // pink
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#fb7185", // soft red
  "#2dd4bf", // aqua
  "#f472b6", // light pink
  "#38bdf8", // light sky
];

type ProjectData = {
  sequences: Pattern[];
  bpm: number;
  currentSequenceIndex: number;
};

type SavedProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: ProjectData;
};

const EMOTIONS = [
  "hyper",
  "dreamy",
  "moody",
  "shimmer",
  "velvet",
  "restless",
  "golden",
  "neon",
];

const ANIMALS = [
  "owl",
  "tiger",
  "panda",
  "panther",
  "lynx",
  "raven",
  "fox",
  "whale",
];

function generateDefaultProjectName() {
  const e = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)] ?? "hyper";
  const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)] ?? "owl";
  return `${e}_${a}`;
}

function getStoredProjects(): SavedProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedProject[];
  } catch {
    return [];
  }
}

function setStoredProjects(projects: SavedProject[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore quota or serialization errors in this beta file system
  }
}

function trackLabel(id: TrackId) {
  const map: Record<string, string> = {
    kick: "Kick",
    snare: "Snare",
    hihat: "Hi-Hat",
    crash: "Crash",
    piano: "Piano",
    heavySynth: "Heavy Synth",
    strings1: "Strings 1",
    strings2: "Strings 2 (AI)",
    strings3: "Strings 3 (AI)",
    toms: "Toms (AI)",
    sax: "Sax (AI)",
  };
  return map[id] ?? id;
}

function isAITrack(id: TrackId) {
  return (
    id === "strings2" || id === "strings3" || id === "toms" || id === "sax"
  );
}

export default function HomePage() {
  // Multiple 8-step sequences; each sequence is a Pattern.
  const [sequences, setSequences] = useState<Pattern[]>([defaultPattern]);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);
  const [bpm, setBpm] = useState<number>(defaultPattern.bpm);
  const pattern = useMemo(
    () => sequences[currentSequenceIndex] ?? sequences[0],
    [sequences, currentSequenceIndex]
  );
  const [playMode, setPlayMode] = useState<"sequence" | "all" | null>(null);
  const [playingSequenceIndex, setPlayingSequenceIndex] = useState<
    number | null
  >(null);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string>("");
  const [pianoRollOpen, setPianoRollOpen] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState<TrackId | null>(null);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [rollOctave, setRollOctave] = useState<number>(4); // shows C4..B4
  const [dragSeqIndex, setDragSeqIndex] = useState<number | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);

  const loopDragRef = useRef<{
    index: number;
    startX: number;
    startLoop: number;
  } | null>(null);

  // Beta file system state
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(
    null
  );
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [openProjects, setOpenProjects] = useState<SavedProject[]>([]);

  const engineRef = useRef<ReturnType<typeof createAudioEngine> | null>(null);
  const playModeRef = useRef<"sequence" | "all" | null>(null);
  const playingSequenceIndexRef = useRef<number | null>(null);
  const sequencesRef = useRef<Pattern[]>(sequences);
  const currentSequenceIndexRef = useRef<number>(currentSequenceIndex);
  const loopRemainingRef = useRef<number>(1);

  // Metronome meter
  const [metroLevel, setMetroLevel] = useState(0);

  useEffect(() => {
    engineRef.current = createAudioEngine({ ...sequences[0], bpm });
    engineRef.current.setOnTick((step) => {
      const mode = playModeRef.current;
      if (!mode) return;

      if (mode === "sequence") {
        const seqIdx = currentSequenceIndexRef.current;
        setPlayingSequenceIndex(seqIdx);
        setActiveStep(step);
        return;
      }

      if (mode === "all") {
        const seqs = sequencesRef.current;
        if (!seqs.length) return;

        let idx = playingSequenceIndexRef.current;
        if (idx == null) {
          idx = 0;
          playingSequenceIndexRef.current = 0;
          setPlayingSequenceIndex(0);
          const first = seqs[0];
          const loops = Math.max(1, first.loopCount ?? 1);
          loopRemainingRef.current = loops;
          engineRef.current?.setPattern(first);
        }

        setActiveStep(step);

        if (step === STEPS - 1) {
          const remaining = (loopRemainingRef.current ?? 1) - 1;
          if (remaining > 0) {
            loopRemainingRef.current = remaining;
            return;
          }

          const nextIdx = (idx + 1) % seqs.length;
          playingSequenceIndexRef.current = nextIdx;
          setPlayingSequenceIndex(nextIdx);

          const nextPattern = seqs[nextIdx];
          const nextLoops = Math.max(1, nextPattern.loopCount ?? 1);
          loopRemainingRef.current = nextLoops;
          engineRef.current?.setPattern(nextPattern);
        }
      }
    });
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!engineRef.current) return;
    if (playModeRef.current === "all") {
      // In play-all mode we only adjust BPM here; sequence switching
      // is handled inside the audio callback.
      engineRef.current.setBpm(bpm);
      return;
    }
    engineRef.current.setPattern({ ...pattern, bpm });
  }, [pattern, bpm]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const lvl = engineRef.current?.getMetronomeLevel?.() ?? 0;
      setMetroLevel(lvl);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // keep refs in sync for the audio callback
  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

  useEffect(() => {
    playingSequenceIndexRef.current = playingSequenceIndex;
  }, [playingSequenceIndex]);

  useEffect(() => {
    sequencesRef.current = sequences;
  }, [sequences]);

  useEffect(() => {
    currentSequenceIndexRef.current = currentSequenceIndex;
  }, [currentSequenceIndex]);

  // Global mouse handlers for adjusting loop counts by dragging the right edge
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const state = loopDragRef.current;
      if (!state) return;
      const dx = e.clientX - state.startX;
      const deltaUnits = Math.round(dx / 40); // ~40px per sequence-length
      const target = state.startLoop + deltaUnits;

      setSequences((seqs) => {
        const next = seqs.slice();
        const current = next[state.index];
        if (!current) return seqs;

        const othersTotal = next.reduce((sum, p, i) => {
          if (i === state.index) return sum;
          return sum + Math.max(1, p.loopCount ?? 1);
        }, 0);

        let newLoop = Math.max(1, target);
        const maxForThis = Math.max(1, MAX_TOTAL_UNITS - othersTotal);
        newLoop = Math.min(newLoop, maxForThis);

        next[state.index] = { ...current, loopCount: newLoop };
        return next;
      });
    }

    function onUp() {
      loopDragRef.current = null;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setSequences]);

  // Focus & select default name when opening the Save dialog
  useEffect(() => {
    if (showSaveDialog && saveInputRef.current) {
      saveInputRef.current.focus();
      saveInputRef.current.select();
    }
  }, [showSaveDialog]);

  const isPlayingSequence = playMode === "sequence";
  const isPlayingAll = playMode === "all";
  const isPlaying = playMode !== null;

  const totalUnits = sequences.reduce(
    (sum, p) => sum + Math.max(1, p.loopCount ?? 1),
    0
  );
  const canAddSequence =
    sequences.length < MAX_SEQUENCES && totalUnits < MAX_TOTAL_UNITS;
  const currentLoopCount = Math.max(
    1,
    sequences[currentSequenceIndex]?.loopCount ?? 1
  );
  const canCopyCurrent =
    canAddSequence && totalUnits + currentLoopCount <= MAX_TOTAL_UNITS;

  const currentSequence = sequences[currentSequenceIndex] ?? sequences[0];
  const currentSequenceColorIndex =
    typeof currentSequence?.sequenceColorIndex === "number"
      ? currentSequence.sequenceColorIndex
      : currentSequenceIndex % SEQUENCE_COLORS.length;
  const currentSequenceColor =
    SEQUENCE_COLORS[currentSequenceColorIndex % SEQUENCE_COLORS.length] ||
    "var(--accent-violet)";

  function handleNewProject() {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlayMode(null);
    setPlayingSequenceIndex(null);
    setActiveStep(0);
    setAiNote("");
    setSequences([defaultPattern]);
    setCurrentSequenceIndex(0);
    setBpm(defaultPattern.bpm);
    setCurrentProjectId(null);
    setCurrentProjectName(null);
    setFileMenuOpen(false);
  }

  function handleOpenClick() {
    const projects = getStoredProjects();
    setOpenProjects(projects);
    setShowOpenDialog(true);
    setFileMenuOpen(false);
  }

  function handleSaveClick() {
    const baseName = currentProjectName ?? generateDefaultProjectName();
    setSaveName(baseName);
    setShowSaveDialog(true);
    setFileMenuOpen(false);
  }

  function handleConfirmSave() {
    if (typeof window === "undefined") return;
    const name = (saveName || generateDefaultProjectName()).trim();
    const now = new Date().toISOString();
    const data: ProjectData = {
      sequences,
      bpm,
      currentSequenceIndex,
    };

    const existing = getStoredProjects();
    let updated: SavedProject[];

    if (currentProjectId) {
      updated = existing.map((p) =>
        p.id === currentProjectId ? { ...p, name, updatedAt: now, data } : p
      );
    } else {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const proj: SavedProject = {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        data,
      };
      updated = [...existing, proj];
      setCurrentProjectId(id);
    }

    setStoredProjects(updated);
    setCurrentProjectName(name);
    setShowSaveDialog(false);
  }

  function handleOpenProject(p: SavedProject) {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlayMode(null);
    setPlayingSequenceIndex(null);
    setActiveStep(0);
    setAiNote("");
    setSequences(p.data.sequences ?? [defaultPattern]);
    setCurrentSequenceIndex(p.data.currentSequenceIndex ?? 0);
    setBpm(p.data.bpm ?? defaultPattern.bpm);
    setCurrentProjectId(p.id);
    setCurrentProjectName(p.name);
    setShowOpenDialog(false);
  }

  async function handlePlaySequence() {
    if (!engineRef.current) return;

    if (playMode === "sequence") {
      engineRef.current.stop();
      setPlayMode(null);
      setPlayingSequenceIndex(null);
      setActiveStep(0);
      return;
    }

    if (playMode === "all") {
      engineRef.current.stop();
    }

    engineRef.current.setPattern({ ...pattern, bpm });
    await engineRef.current.start();
    setPlayMode("sequence");
    setPlayingSequenceIndex(currentSequenceIndex);
  }

  async function handlePlayAll() {
    if (!engineRef.current) return;

    if (playMode === "all") {
      engineRef.current.stop();
      setPlayMode(null);
      setPlayingSequenceIndex(null);
      setActiveStep(0);
      return;
    }

    if (playMode === "sequence") {
      engineRef.current.stop();
    }

    const seqs = sequencesRef.current;
    if (!seqs.length) return;

    const first = seqs[0];
    const loops = Math.max(1, first.loopCount ?? 1);
    loopRemainingRef.current = loops;
    engineRef.current.setPattern({ ...first, bpm });
    await engineRef.current.start();
    setPlayMode("all");
    setPlayingSequenceIndex(0);
    playingSequenceIndexRef.current = 0;
  }

  // Update only the currently selected sequence's pattern
  const setPatternForCurrent: React.Dispatch<React.SetStateAction<Pattern>> = (
    updater
  ) => {
    setSequences((seqs) => {
      const next = seqs.slice();
      const curr = next[currentSequenceIndex] ?? next[0];
      const updated =
        typeof updater === "function"
          ? (updater as (p: Pattern) => Pattern)(curr)
          : updater;
      next[currentSequenceIndex] = updated;
      return next;
    });
  };

  // Keep all sequences' bpm in sync with the global tempo
  function setGlobalBpm(nextBpm: number) {
    setBpm(nextBpm);
    setSequences((seqs) =>
      seqs.map((seq) => ({
        ...seq,
        bpm: nextBpm,
      }))
    );
  }

  function updateTrack(trackId: TrackId, updater: (t: Track) => Track) {
    setPatternForCurrent((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === trackId ? updater(t) : t)),
    }));
  }

  function toggleStep(track: Track, stepIdx: number) {
    if (!track.enabled) return;

    if (track.kind === "drum") {
      updateTrack(track.id, (t) => {
        if (t.kind !== "drum") return t;
        const steps = [...t.steps];
        steps[stepIdx] = steps[stepIdx] ? 0 : 1;
        return { ...t, steps };
      });
      return;
    }

    // pitched: select this cell for piano roll editing
    setSelectedTrackId(track.id);
    setSelectedStep(stepIdx);
    setPianoRollOpen(true);

    // auto-octave to current note (if exists)
    const existing = track.steps[stepIdx];
    if (existing?.midi !== undefined) {
      const oct = Math.floor(existing.midi / 12) - 1;
      setRollOctave(Math.max(0, Math.min(8, oct)));
    }
  }

  // Ensure each sequence has a stable color index so colors move with
  // the sequence when reordering.
  useEffect(() => {
    setSequences((prev) => {
      let changed = false;
      const next = prev.map((seq, idx) => {
        if (typeof seq.sequenceColorIndex === "number") return seq;
        changed = true;
        return {
          ...seq,
          sequenceColorIndex: idx % SEQUENCE_COLORS.length,
        };
      });
      return changed ? next : prev;
    });
  }, [sequences]);

  function exportSong(filename: string) {
    const midi = sequencesToMidi(
      sequences.map((seq) => ({ ...seq, bpm })),
      bpm
    );
    const bytes = midi.toArray();
    const blob = new Blob([new Uint8Array(bytes)], { type: "audio/midi" });
    saveAs(blob, filename);
  }

  async function producify() {
    setBusy(true);
    setAiNote("");
    try {
      const midi = patternToMidi({ ...pattern, bpm });
      const midiBase64 = midiToBase64(midi);

      const res = await fetch("/api/producify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midiBase64, bpm }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Producify failed");
      }

      const data = await res.json();

      setPatternForCurrent((p) => {
        const tracks = p.tracks.map((t) => {
          if (t.id === "strings2" && t.kind === "pitched")
            return { ...t, enabled: true, steps: data.tracks.strings2 };
          if (t.id === "strings3" && t.kind === "pitched")
            return { ...t, enabled: true, steps: data.tracks.strings3 };
          if (t.id === "sax" && t.kind === "pitched")
            return { ...t, enabled: true, steps: data.tracks.sax };
          if (t.id === "toms" && t.kind === "drum")
            return { ...t, enabled: true, steps: data.tracks.toms };
          return t;
        });
        return { ...p, tracks };
      });

      if (data.notes) setAiNote(data.notes);
    } catch (e: any) {
      setAiNote(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui",
        maxWidth: 1100,
        margin: "0 auto 32px auto",
        color: "var(--text-primary)",
      }}
    >
      {/* File menu / beta file system */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setFileMenuOpen((v) => !v)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--border-subtle)",
              background: "var(--background-elevated-soft)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            File ▾
          </button>
          {fileMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "110%",
                left: 0,
                minWidth: 140,
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                background: "var(--background-elevated)",
                boxShadow: "0 18px 45px rgba(0,0,0,0.55)",
                padding: 4,
                zIndex: 20,
              }}
            >
              <button
                onClick={handleNewProject}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                New
              </button>
              <button
                onClick={handleOpenClick}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Open…
              </button>
              <button
                onClick={handleSaveClick}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Save…
              </button>
            </div>
          )}
        </div>

        {currentProjectName && (
          <div
            style={{
              fontSize: 12,
              opacity: 0.8,
              maxWidth: 260,
              textAlign: "right",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Project: {currentProjectName}
          </div>
        )}
      </div>
      <h1
        style={{
          fontSize: 24,
          marginBottom: 6,
          fontWeight: 700,
          letterSpacing: 0.4,
        }}
      >
        Producify Studio (v1)
      </h1>

      {/* Sequences control */}
      <div
        style={{
          margin: "8px 0 14px 0",
          padding: 10,
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
          background: "var(--background-elevated)",
          boxShadow: "0 14px 45px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 6,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "var(--accent-purple)",
          }}
        >
          Sequences
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Drag blocks to reorder. Drag right edge to loop.
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                if (!canAddSequence) return;
                setSequences((seqs) => {
                  if (seqs.length >= MAX_SEQUENCES) return seqs;
                  const total = seqs.reduce(
                    (sum, p) => sum + Math.max(1, p.loopCount ?? 1),
                    0
                  );
                  if (total >= MAX_TOTAL_UNITS) return seqs;

                  const curr = seqs[currentSequenceIndex] ?? seqs[0];
                  const insertIndex = currentSequenceIndex + 1;
                  const blankTracks = curr.tracks.map((t) =>
                    t.kind === "drum"
                      ? { ...t, steps: Array(STEPS).fill(0) }
                      : { ...t, steps: Array(STEPS).fill(null) }
                  );
                  // Assign a fresh neon color index for this new sequence
                  const usedColorIndices = seqs.map((s, i) =>
                    typeof s.sequenceColorIndex === "number"
                      ? s.sequenceColorIndex
                      : i % SEQUENCE_COLORS.length
                  );
                  const maxExisting =
                    usedColorIndices.length > 0
                      ? Math.max(...usedColorIndices)
                      : -1;
                  const colorIndex = (maxExisting + 1) % SEQUENCE_COLORS.length;
                  const newSeq: Pattern = {
                    ...curr,
                    tracks: blankTracks,
                    loopCount: 1,
                    sequenceColorIndex: colorIndex,
                  };
                  const next = [
                    ...seqs.slice(0, insertIndex),
                    newSeq,
                    ...seqs.slice(insertIndex),
                  ];
                  return next;
                });
                setCurrentSequenceIndex((i) => i + 1);
              }}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                background:
                  "radial-gradient(circle at 0 0, rgba(168,85,247,0.45), transparent 55%), rgba(76,29,149,0.95)",
                border: "1px solid rgba(168,85,247,0.95)",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.3,
                boxShadow:
                  "0 0 0 1px rgba(76,29,149,0.6), 0 0 10px rgba(129,140,248,0.35)",
              }}
              disabled={!canAddSequence}
            >
              ＋ New
            </button>

            <button
              onClick={() => {
                if (!canCopyCurrent) return;
                setSequences((seqs) => {
                  if (seqs.length >= MAX_SEQUENCES) return seqs;
                  const curr = seqs[currentSequenceIndex] ?? seqs[0];

                  const total = seqs.reduce(
                    (sum, p) => sum + Math.max(1, p.loopCount ?? 1),
                    0
                  );
                  const loops = Math.max(1, curr.loopCount ?? 1);
                  if (total + loops > MAX_TOTAL_UNITS) return seqs;

                  const insertIndex = currentSequenceIndex + 1;
                  const copiedTracks = curr.tracks.map((t) =>
                    t.kind === "drum"
                      ? { ...t, steps: [...t.steps] }
                      : { ...t, steps: [...t.steps] }
                  );
                  const newSeq: Pattern = {
                    ...curr,
                    tracks: copiedTracks,
                  };

                  const next = [
                    ...seqs.slice(0, insertIndex),
                    newSeq,
                    ...seqs.slice(insertIndex),
                  ];
                  return next;
                });
                setCurrentSequenceIndex((i) => i + 1);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: "var(--background-elevated-soft)",
                border: "1px solid rgba(148,163,184,0.85)",
                color: "var(--text-primary)",
                boxShadow:
                  "0 0 0 1px rgba(15,23,42,0.55), 0 0 6px rgba(15,23,42,0.4)",
                fontSize: 12,
              }}
              disabled={!canCopyCurrent}
            >
              ⧉ Copy
            </button>

            <button
              onClick={() => {
                setSequences((seqs) => {
                  if (seqs.length === 1) {
                    const only = seqs[0];
                    const clearedTracks = only.tracks.map((t) =>
                      t.kind === "drum"
                        ? { ...t, steps: Array(STEPS).fill(0) }
                        : { ...t, steps: Array(STEPS).fill(null) }
                    );
                    return [{ ...only, tracks: clearedTracks }];
                  }
                  const next = [
                    ...seqs.slice(0, currentSequenceIndex),
                    ...seqs.slice(currentSequenceIndex + 1),
                  ];
                  const newIndex = Math.min(
                    currentSequenceIndex,
                    next.length - 1
                  );
                  setCurrentSequenceIndex(newIndex);
                  return next;
                });
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.95)",
                color: "rgba(248,113,113,0.96)",
                boxShadow:
                  "0 0 0 1px rgba(127,29,29,0.6), 0 0 8px rgba(248,113,113,0.35)",
                fontSize: 12,
              }}
              disabled={sequences.length === 1}
            >
              ✕ Delete
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "stretch",
          }}
        >
          {/* Leading drop zone (before first sequence) */}
          <div
            onDragOver={(e) => {
              if (dragSeqIndex == null) return;
              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "move";
              }
              setDragInsertIndex(0);
            }}
            onDragLeave={() => {
              if (dragInsertIndex === 0) {
                setDragInsertIndex(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragSeqIndex == null) return;
              const from = dragSeqIndex;
              const to = 0;
              if (from === to) {
                setDragInsertIndex(null);
                return;
              }
              setSequences((seqs) => {
                const next = seqs.slice();
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              });
              setCurrentSequenceIndex((prev) => {
                if (prev === from) return to;
                if (from < to && prev > from && prev <= to) return prev - 1;
                if (from > to && prev >= to && prev < from) return prev + 1;
                return prev;
              });
              setDragSeqIndex(null);
              setDragInsertIndex(null);
            }}
            style={{
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              width: dragInsertIndex === 0 ? 14 : 6,
              transition: "width 80ms ease-out, background 80ms ease-out",
            }}
          >
            <div
              style={{
                width: 2,
                borderRadius: 999,
                background:
                  dragInsertIndex === 0
                    ? "rgba(255,255,255,0.9)"
                    : "transparent",
              }}
            />
          </div>

          {sequences.map((seq, idx) => {
            const isCurrent = idx === currentSequenceIndex;
            const isBeingPlayed = isPlaying && idx === playingSequenceIndex;

            const loopCount = Math.max(1, seq.loopCount ?? 1);
            const baseWidth = 70;
            const widthPerLoop = 35; // lengthen visibly as loops increase
            const blockWidth = baseWidth + (loopCount - 1) * widthPerLoop;
            const colorIndex =
              typeof seq.sequenceColorIndex === "number"
                ? seq.sequenceColorIndex
                : idx % SEQUENCE_COLORS.length;
            const color =
              SEQUENCE_COLORS[colorIndex % SEQUENCE_COLORS.length] ||
              "var(--accent-violet)";

            const baseBorderWidth = isBeingPlayed ? 2 : 1;
            const baseBorderColor =
              isBeingPlayed || isCurrent ? color : "var(--border-subtle)";
            const loopIconBg = "#ffffff";
            const loopIconBorder =
              loopCount > 1 ? `${color}bb` : "rgba(148,163,184,0.9)";
            const loopIconShadow =
              loopCount > 1
                ? `0 0 0 1px ${color}aa, 0 0 10px ${color}88`
                : "0 0 0 1px rgba(15,23,42,0.45)";

            return (
              <React.Fragment key={idx}>
                <div
                  draggable
                  onDragStart={(e) => {
                    setDragSeqIndex(idx);
                    if (e.dataTransfer) {
                      e.dataTransfer.effectAllowed = "move";
                      // Some browsers (e.g. Safari) require data to be set
                      // for drag-and-drop events to properly fire drops.
                      e.dataTransfer.setData("text/plain", String(idx));
                    }
                  }}
                  onDragEnd={() => {
                    setDragSeqIndex(null);
                    setDragInsertIndex(null);
                  }}
                  onClick={() => setCurrentSequenceIndex(idx)}
                  style={{
                    minWidth: blockWidth,
                    padding: "6px 10px",
                    borderRadius: 8,
                    borderStyle: "solid",
                    borderColor: baseBorderColor,
                    borderWidth: baseBorderWidth,
                    background: isCurrent ? `${color}66` : `${color}40`,
                    color: "var(--text-primary)",
                    fontSize: 12,
                    cursor: "pointer",
                    boxShadow: isBeingPlayed
                      ? `0 0 0 1px ${color}cc, 0 0 18px ${color}b3`
                      : isCurrent
                      ? `0 0 0 1px ${color}aa, 0 0 10px ${color}66`
                      : `0 0 0 1px rgba(15,23,42,0.65), 0 0 10px ${color}33`,
                    userSelect: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {/* Left: loop count */}
                    {loopCount > 1 && (
                      <span
                        style={{
                          fontSize: 11,
                          opacity: 0.8,
                        }}
                      >
                        x{loopCount}
                      </span>
                    )}

                    {/* Right: loop drag icon, pushed to the far right */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        loopDragRef.current = {
                          index: idx,
                          startX: e.clientX,
                          startLoop: loopCount,
                        };
                      }}
                      className={
                        loopCount > 1
                          ? "seq-loop-icon seq-loop-icon--active"
                          : "seq-loop-icon"
                      }
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        border: `1px solid ${loopIconBorder}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginLeft: "auto",
                        cursor: "ew-resize",
                        color,
                        background: loopIconBg,
                        boxShadow: loopIconShadow,
                        fontSize: 20,
                        fontWeight: 900,
                        lineHeight: 0.85,
                      }}
                    >
                      ⟲
                    </div>
                  </div>
                </div>

                {/* Drop zone after this sequence (insert after idx) */}
                <div
                  onDragOver={(e) => {
                    if (dragSeqIndex == null) return;
                    e.preventDefault();
                    if (e.dataTransfer) {
                      e.dataTransfer.dropEffect = "move";
                    }
                    setDragInsertIndex(idx + 1);
                  }}
                  onDragLeave={() => {
                    if (dragInsertIndex === idx + 1) {
                      setDragInsertIndex(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragSeqIndex == null) return;
                    const from = dragSeqIndex;
                    let to = idx + 1;
                    if (from < to) to -= 1;
                    if (from === to) {
                      setDragInsertIndex(null);
                      return;
                    }
                    setSequences((seqs) => {
                      const next = seqs.slice();
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      return next;
                    });
                    setCurrentSequenceIndex((prev) => {
                      if (prev === from) return to;
                      if (from < to && prev > from && prev <= to)
                        return prev - 1;
                      if (from > to && prev >= to && prev < from)
                        return prev + 1;
                      return prev;
                    });
                    setDragSeqIndex(null);
                    setDragInsertIndex(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    justifyContent: "center",
                    width: dragInsertIndex === idx + 1 ? 14 : 6,
                    transition: "width 80ms ease-out, background 80ms ease-out",
                  }}
                >
                  <div
                    style={{
                      width: 2,
                      borderRadius: 999,
                      background:
                        dragInsertIndex === idx + 1
                          ? "rgba(255,255,255,0.9)"
                          : "transparent",
                    }}
                  />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Time controls */}
      <div
        style={{
          margin: "0 0 10px 0",
          padding: 10,
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
          background: "var(--background-elevated)",
          boxShadow: "0 14px 45px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 6,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "var(--accent-blue)",
          }}
        >
          Time Controls
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Tempo
            <input
              type="range"
              min={60}
              max={180}
              value={bpm}
              onChange={(e) => setGlobalBpm(Number(e.target.value))}
            />
            <span
              style={{
                width: 40,
                fontVariantNumeric: "tabular-nums",
                color: "var(--accent-blue)",
              }}
            >
              {bpm}
            </span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Metronome
            <input
              type="checkbox"
              checked={pattern.metronomeOn}
              onChange={(e) =>
                setPatternForCurrent((p) => ({
                  ...p,
                  metronomeOn: e.target.checked,
                }))
              }
            />
          </label>

          {pattern.metronomeOn && (
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              Metro Vol
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={pattern.metronomeVolume}
                onChange={(e) =>
                  setPatternForCurrent((p) => ({
                    ...p,
                    metronomeVolume: Number(e.target.value),
                  }))
                }
              />
            </label>
          )}

          <div style={{ marginLeft: "auto", opacity: 0.7 }}>
            <div
              style={{
                width: 70,
                height: 6,
                borderRadius: 999,
                background: "var(--background-subtle)",
                marginTop: 2,
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 999,
                  background: "var(--accent-blue-neon)",
                  width: `${Math.min(1, metroLevel) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          margin: "10px 0 14px 0",
          padding: 10,
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
          background: "var(--background-elevated)",
          boxShadow: "0 14px 45px rgba(0,0,0,0.3)",
        }}
      >
        {/* Left cluster: play */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={handlePlaySequence}
            style={{
              padding: "6px 12px",
              fontWeight: 600,
              borderRadius: 999,
              border: "1px solid var(--border-strong)",
              background: isPlayingSequence
                ? "var(--accent-purple)"
                : "var(--background-elevated-soft)",
              color: "white",
              fontSize: 13,
            }}
          >
            {isPlayingSequence ? "Stop Seq" : "Play Seq"}
          </button>

          <button
            onClick={handlePlayAll}
            style={{
              padding: "6px 12px",
              fontWeight: 600,
              borderRadius: 999,
              border: "1px solid var(--border-strong)",
              background: isPlayingAll
                ? "var(--accent-violet)"
                : "var(--background-elevated-soft)",
              color: "white",
              fontSize: 13,
            }}
          >
            {isPlayingAll ? "Stop All" : "Play All"}
          </button>
        </div>

        {/* Right cluster: Producify call-to-action */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            textAlign: "right",
          }}
        >
          <span
            style={{
              fontSize: 12,
              opacity: 0.8,
              maxWidth: 260,
            }}
          >
            All done? Sprinkle on some AI orchestration -
          </span>

          <button
            onClick={producify}
            disabled={busy}
            style={{
              padding: "6px 14px",
              fontWeight: 700,
              borderRadius: 999,
              border: "1px solid var(--accent-blue-neon)",
              background:
                "radial-gradient(circle at 0 0, rgba(56,189,248,0.35), transparent 55%), #020617",
              color: "#e0f2fe",
              textShadow: "0 0 8px rgba(56,189,248,0.75)",
              boxShadow:
                "0 0 0 1px rgba(56,189,248,0.45), 0 0 20px rgba(56,189,248,0.55)",
              fontSize: 13,
              letterSpacing: 0.4,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Producifying…" : "Producify"}
          </button>

          <button
            onClick={() => exportSong("song.mid")}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--border-subtle)",
              background: "var(--background-elevated-soft)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          >
            Export Song
          </button>
        </div>
      </div>

      {/* Open dialog */}
      {showOpenDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
          }}
        >
          <div
            style={{
              minWidth: 360,
              maxWidth: 520,
              maxHeight: "70vh",
              overflow: "auto",
              background: "var(--background-elevated)",
              borderRadius: 12,
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.75)",
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>Open Song</div>
              <button
                onClick={() => setShowOpenDialog(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--text-subtle)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>

            {openProjects.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                No saved songs yet. Use Save to create one.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {openProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleOpenProject(p)}
                    style={{
                      textAlign: "left",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      background: "var(--background-elevated-soft)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        marginBottom: 2,
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span>
                        Created: {new Date(p.createdAt).toLocaleString()}
                      </span>
                      <span>
                        Modified: {new Date(p.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
          }}
        >
          <div
            style={{
              minWidth: 320,
              maxWidth: 420,
              background: "var(--background-elevated)",
              borderRadius: 12,
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.75)",
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>Save Song</div>
              <button
                onClick={() => setShowSaveDialog(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--text-subtle)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
            </div>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 13,
              }}
            >
              File name
              <input
                ref={saveInputRef}
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--background-elevated-soft)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => setShowSaveDialog(false)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--background-elevated-soft)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--accent-blue)",
                  background: "rgba(59,130,246,0.2)",
                  color: "var(--accent-blue)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {aiNote && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            background: "var(--background-elevated)",
            color: "var(--text-muted)",
          }}
        >
          <strong>AI:</strong> {aiNote}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--background-elevated)",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px repeat(8, 1fr)",
            background: "var(--background-elevated-soft)",
            margin: "-2px -2px  -2px",
            border: `2px solid ${currentSequenceColor}`,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
          }}
        >
          <div style={{ padding: 10, fontWeight: 600 }}>Track</div>
          {Array.from({ length: STEPS }).map((_, i) => (
            <div
              key={i}
              style={{ padding: 10, textAlign: "center", fontWeight: 600 }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Tracks */}
        {pattern.tracks.map((t) => {
          const isSelected = t.id === selectedTrackId;

          const playingSeq =
            playingSequenceIndex != null
              ? sequences[playingSequenceIndex] ?? null
              : null;
          const playingColor =
            playingSeq && typeof playingSeq.sequenceColorIndex === "number"
              ? SEQUENCE_COLORS[
                  playingSeq.sequenceColorIndex % SEQUENCE_COLORS.length
                ] || "var(--accent-violet)"
              : "var(--accent-violet)";

          return (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "180px repeat(8, 1fr)",
                borderTop: "1px solid var(--border-subtle)",
                opacity: t.enabled ? 1 : 0.45,
                minHeight: 64,
                background: isSelected
                  ? "rgba(129,140,248,0.16)"
                  : isAITrack(t.id)
                  ? "rgba(15,23,42,0.5)"
                  : "transparent",
              }}
            >
              <div
                style={{
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
                onClick={() => setSelectedTrackId(t.id)}
              >
                <span>
                  {trackLabel(t.id)}{" "}
                  {isAITrack(t.id) ? (
                    <em style={{ opacity: 0.7, color: "var(--accent-violet)" }}>
                      (AI)
                    </em>
                  ) : null}
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={(t as any).volume ?? 1}
                      onChange={(e) =>
                        updateTrack(t.id, (tr) => ({
                          ...tr,
                          volume: Number(e.target.value),
                        }))
                      }
                      style={{ width: 56 }}
                    />
                  </label>
                  <button
                    onClick={() =>
                      updateTrack(
                        t.id,
                        (tr) => ({ ...tr, enabled: !tr.enabled } as any)
                      )
                    }
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: t.enabled
                        ? "1px solid var(--accent-blue)"
                        : "1px solid var(--border-subtle)",
                      background: t.enabled
                        ? "rgba(59,130,246,0.18)"
                        : "var(--background-elevated-soft)",
                      color: t.enabled
                        ? "var(--accent-blue)"
                        : "var(--text-muted)",
                      fontSize: 11,
                    }}
                    disabled={isAITrack(t.id) && !t.enabled} // keep disabled until AI fills, per your spec
                    title={
                      isAITrack(t.id) && !t.enabled
                        ? "Unlocked by Producify"
                        : t.enabled
                        ? "Mute track"
                        : "Unmute track"
                    }
                  >
                    M
                  </button>
                </div>
              </div>

              {Array.from({ length: STEPS }).map((_, stepIdx) => {
                const isActive =
                  isPlaying &&
                  playingSequenceIndex === currentSequenceIndex &&
                  stepIdx === activeStep;
                const filled =
                  t.kind === "drum"
                    ? t.steps[stepIdx] === 1
                    : t.steps[stepIdx] !== null;

                return (
                  <button
                    key={stepIdx}
                    onClick={() => toggleStep(t, stepIdx)}
                    disabled={!t.enabled}
                    style={{
                      height: "100%",
                      width: "100%",
                      border: "none",
                      borderLeft: "1px solid var(--border-subtle)",
                      cursor: t.enabled ? "pointer" : "not-allowed",
                      outline: "none",
                      opacity: filled ? 1 : 0.25,
                      background: isActive
                        ? playingColor
                        : filled
                        ? isAITrack(t.id)
                          ? "rgba(52,211,153,0.9)"
                          : "rgba(59,130,246,0.9)"
                        : "transparent",
                      color: filled ? "#020617" : "var(--text-subtle)",
                      fontSize: 0,
                      transition:
                        "background 140ms ease-out, transform 60ms, box-shadow 180ms ease-out",
                      transform: isActive ? "scale(1.05)" : "scale(1)",
                      boxShadow: isActive
                        ? "0 0 0 1px rgba(168,85,247,0.75), 0 0 16px rgba(168,85,247,0.7)"
                        : filled
                        ? "0 0 0 1px rgba(15,23,42,0.7), 0 0 12px rgba(59,130,246,0.55)"
                        : "none",
                    }}
                    title={
                      t.kind === "pitched" && t.steps[stepIdx]
                        ? `MIDI: ${t.steps[stepIdx]!.midi}`
                        : ""
                    }
                  >
                    {" "}
                  </button>
                );
              })}
            </div>
          );
        })}
        <PianoRoll
          open={pianoRollOpen}
          onToggle={() => setPianoRollOpen((v) => !v)}
          pattern={pattern}
          setPattern={setPatternForCurrent}
          selectedTrackId={selectedTrackId}
          selectedStep={selectedStep}
          setSelectedStep={setSelectedStep}
          octave={rollOctave}
          setOctave={setRollOctave}
        />
      </div>
    </div>
  );
}
