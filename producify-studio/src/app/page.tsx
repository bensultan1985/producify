"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { defaultPattern } from "@/lib/defaultPattern";
import { Pattern, STEPS, Track, TrackId } from "@/lib/types";
import { createAudioEngine } from "@/lib/audioEngine";
import { patternToMidi, midiToBase64, sequencesToMidi } from "@/lib/midiExport";
import { saveAs } from "file-saver";
import { PianoRoll } from "@/components/PianoRoll";

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

  const engineRef = useRef<ReturnType<typeof createAudioEngine> | null>(null);
  const playModeRef = useRef<"sequence" | "all" | null>(null);
  const playingSequenceIndexRef = useRef<number | null>(null);
  const sequencesRef = useRef<Pattern[]>(sequences);
  const currentSequenceIndexRef = useRef<number>(currentSequenceIndex);

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
          engineRef.current?.setPattern({ ...seqs[0], bpm });
        }

        setActiveStep(step);

        if (step === STEPS - 1) {
          const nextIdx = (idx + 1) % seqs.length;
          playingSequenceIndexRef.current = nextIdx;
          setPlayingSequenceIndex(nextIdx);
          engineRef.current?.setPattern({ ...seqs[nextIdx], bpm });
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
    if (playModeRef.current === "all") return; // play-all manages its own sequence switching
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

  const isPlayingSequence = playMode === "sequence";
  const isPlayingAll = playMode === "all";
  const isPlaying = playMode !== null;

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

    engineRef.current.setPattern({ ...seqs[0], bpm });
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
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setCurrentSequenceIndex((i) => Math.max(0, i - 1))}
            disabled={currentSequenceIndex === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--background-elevated-soft)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          >
            ◀ Prev
          </button>
          <div>
            Seq {currentSequenceIndex + 1} / {sequences.length}
          </div>
          <button
            onClick={() =>
              setCurrentSequenceIndex((i) =>
                Math.min(sequences.length - 1, i + 1)
              )
            }
            disabled={currentSequenceIndex >= sequences.length - 1}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--background-elevated-soft)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          >
            Next ▶
          </button>

          <button
            onClick={() => {
              if (currentSequenceIndex === 0) return;
              setSequences((seqs) => {
                const next = seqs.slice();
                const i = currentSequenceIndex;
                const tmp = next[i - 1];
                next[i - 1] = next[i];
                next[i] = tmp;
                return next;
              });
              setCurrentSequenceIndex((i) => i - 1);
            }}
            disabled={currentSequenceIndex === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--background-elevated-soft)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          >
            Slide ◀
          </button>

          <button
            onClick={() => {
              if (currentSequenceIndex >= sequences.length - 1) return;
              setSequences((seqs) => {
                const next = seqs.slice();
                const i = currentSequenceIndex;
                const tmp = next[i + 1];
                next[i + 1] = next[i];
                next[i] = tmp;
                return next;
              });
              setCurrentSequenceIndex((i) => i + 1);
            }}
            disabled={currentSequenceIndex >= sequences.length - 1}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--background-elevated-soft)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          >
            Slide ▶
          </button>

          <button
            onClick={() => {
              setSequences((seqs) => {
                const curr = seqs[currentSequenceIndex] ?? seqs[0];
                const insertIndex = currentSequenceIndex + 1;
                const blankTracks = curr.tracks.map((t) =>
                  t.kind === "drum"
                    ? { ...t, steps: Array(STEPS).fill(0) }
                    : { ...t, steps: Array(STEPS).fill(null) }
                );
                const newSeq: Pattern = { ...curr, tracks: blankTracks };
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
              background: "var(--accent-purple)",
              border: "1px solid var(--accent-violet)",
              color: "white",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            + After
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
              background: "transparent",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              fontSize: 12,
            }}
            disabled={sequences.length === 1}
          >
            Delete
          </button>
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

          return (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "180px repeat(8, 1fr)",
                borderTop: "1px solid var(--border-subtle)",
                opacity: t.enabled ? 1 : 0.45,
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
                    Vol
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
                        : "Toggle track"
                    }
                  >
                    {t.enabled ? "On" : "Off"}
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
                      height: 44,
                      border: "none",
                      borderLeft: "1px solid var(--border-subtle)",
                      cursor: t.enabled ? "pointer" : "not-allowed",
                      outline: "none",
                      opacity: filled ? 1 : 0.25,
                      background: isActive
                        ? "var(--accent-violet)"
                        : filled
                        ? isAITrack(t.id)
                          ? "rgba(52,211,153,0.9)"
                          : "rgba(59,130,246,0.9)"
                        : "transparent",
                      color: filled ? "#020617" : "var(--text-subtle)",
                      fontSize: 20,
                      transition:
                        "background 80ms ease-out, transform 60ms, box-shadow 80ms ease-out",
                      transform: isActive ? "scale(1.05)" : "scale(1)",
                      boxShadow: isActive
                        ? "0 0 0 1px rgba(168,85,247,0.75), 0 0 16px rgba(168,85,247,0.7)"
                        : filled
                        ? "0 0 0 1px rgba(15,23,42,0.75)"
                        : "none",
                    }}
                    title={
                      t.kind === "pitched" && t.steps[stepIdx]
                        ? `MIDI: ${t.steps[stepIdx]!.midi}`
                        : ""
                    }
                  >
                    {filled ? "●" : "·"}
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
