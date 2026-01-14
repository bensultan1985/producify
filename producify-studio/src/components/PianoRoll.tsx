"use client";

import React from "react";
import { Pattern, Track, TrackId, STEPS } from "@/lib/types";

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

function midiToName(midi: number) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Props = {
  open: boolean;
  onToggle: () => void;

  pattern: Pattern;
  setPattern: React.Dispatch<React.SetStateAction<Pattern>>;

  selectedTrackId: TrackId | null;
  selectedStep: number | null;
  setSelectedStep: (step: number | null) => void;

  // octave here means the octave number shown (e.g. 4 shows C4..B4)
  octave: number;
  setOctave: (o: number) => void;
};

export function PianoRoll({
  open,
  onToggle,
  pattern,
  setPattern,
  selectedTrackId,
  selectedStep,
  setSelectedStep,
  octave,
  setOctave,
}: Props) {
  const selectedTrack: Track | undefined = pattern.tracks.find(
    (t) => t.id === selectedTrackId
  );

  const canEditTrack =
    selectedTrack && selectedTrack.kind === "pitched" && selectedTrack.enabled;

  const baseMidi = (octave + 1) * 12; // C of the displayed octave

  const currentMidi =
    selectedTrack &&
    selectedTrack.kind === "pitched" &&
    selectedStep !== null &&
    selectedStep >= 0 &&
    selectedStep < STEPS
      ? selectedTrack.steps[selectedStep]?.midi ?? null
      : null;

  function setNote(midi: number, stepIdx: number) {
    if (!canEditTrack) return;

    // When clicking in the piano roll, treat that step as selected
    // so the "Selected note" readout and marker stay in sync.
    setSelectedStep(stepIdx);

    setPattern((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        if (t.kind !== "pitched") return t;

        const steps = [...t.steps];
        const existing = steps[stepIdx];

        // Clicking an already-active note at this pitch removes it;
        // otherwise we set/update the note at this step.
        if (existing && (existing as any).midi === midi) {
          steps[stepIdx] = null;
        } else {
          steps[stepIdx] = { midi, vel: 0.8, durSteps: 1 };
        }
        return { ...t, steps };
      }),
    }));
  }

  function clearNote() {
    if (!canEditTrack) return;
    if (selectedStep === null || selectedStep < 0 || selectedStep >= STEPS) {
      return;
    }

    setPattern((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        if (t.kind !== "pitched") return t;

        const steps = [...t.steps];
        steps[selectedStep] = null;
        return { ...t, steps };
      }),
    }));
  }

  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header (clickable) */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "10px 12px",
          background: "#fafafa",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontWeight: 600,
        }}
      >
        <span>Piano Roll</span>
        <span style={{ opacity: 0.7 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ padding: 12 }}>
          {/* Controls */}
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ opacity: 0.85 }}>
              Track: <strong>{selectedTrack ? selectedTrack.id : "—"}</strong>
            </div>
            <div style={{ opacity: 0.85 }}>
              Step:{" "}
              <strong>{selectedStep !== null ? selectedStep + 1 : "—"}</strong>
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => setOctave(clamp(octave - 1, 0, 8))}
                style={{ padding: "6px 10px" }}
              >
                − Oct
              </button>
              <div style={{ minWidth: 90, textAlign: "center" }}>
                <strong>Octave {octave}</strong>
              </div>
              <button
                onClick={() => setOctave(clamp(octave + 1, 0, 8))}
                style={{ padding: "6px 10px" }}
              >
                + Oct
              </button>
            </div>

            <button
              onClick={clearNote}
              disabled={!canEditTrack || selectedStep === null}
              style={{ padding: "6px 10px" }}
            >
              Clear Step
            </button>

            <div style={{ opacity: 0.8 }}>
              Selected note:{" "}
              <strong>
                {currentMidi !== null ? midiToName(currentMidi) : "—"}
              </strong>
            </div>

            {!canEditTrack && (
              <div style={{ opacity: 0.7 }}>
                (Select an enabled pitched track to edit.)
              </div>
            )}
          </div>

          {/* Grid: 12 rows (one octave) x 8 columns (steps) */}
          <div
            style={{
              marginTop: 12,
              border: "1px solid #eee",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "110px repeat(8, 1fr)",
                background: "#fcfcfc",
                borderBottom: "1px solid #eee",
              }}
            >
              <div style={{ padding: 10, fontWeight: 600 }}>Note</div>
              {Array.from({ length: STEPS }).map((_, i) => (
                <div
                  key={i}
                  style={{ padding: 10, textAlign: "center", fontWeight: 600 }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Show highest note at top: B .. C */}
            {Array.from({ length: 12 }).map((_, row) => {
              const semitone = 11 - row;
              const midi = baseMidi + semitone;
              const label = midiToName(midi);

              // Styling: lightly tint black keys
              const isBlack = [1, 3, 6, 8, 10].includes(semitone);

              return (
                <div
                  key={midi}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px repeat(8, 1fr)",
                    borderTop: "1px solid #f0f0f0",
                    background: isBlack ? "rgba(0,0,0,0.03)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{label}</span>
                  </div>

                  {Array.from({ length: STEPS }).map((_, stepIdx) => {
                    const isSelectedStep = selectedStep === stepIdx;
                    const noteHere =
                      selectedTrack &&
                      selectedTrack.kind === "pitched" &&
                      selectedTrack.steps[stepIdx]?.midi === midi;
                    const isCellActive = noteHere && isSelectedStep;

                    return (
                      <button
                        key={stepIdx}
                        disabled={!canEditTrack}
                        onClick={() => setNote(midi, stepIdx)}
                        title={
                          !canEditTrack
                            ? "Select an enabled pitched track to edit"
                            : `Set step ${stepIdx + 1} to ${label}`
                        }
                        style={{
                          height: 38,
                          border: "none",
                          borderLeft: "1px solid #eee",
                          cursor: canEditTrack ? "pointer" : "not-allowed",
                          opacity: canEditTrack ? 1 : 0.25,
                          outline: isCellActive
                            ? "2px solid rgba(0,0,0,0.25)"
                            : "none",
                          fontWeight: isCellActive ? 700 : 400,
                        }}
                      >
                        {noteHere ? "●" : "·"}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: 10, opacity: 0.75 }}>
            Select a pitched track, then click anywhere in this piano roll to
            set notes per step. Next upgrade is drag-to-paint across steps.
          </p>
        </div>
      )}
    </div>
  );
}
