import { Midi } from "@tonejs/midi";
import { Pattern, STEPS, Track } from "./types";

const MAX_TOTAL_UNITS = 64; // max total length in 8-step sequences

function stepToTimeSeconds(stepIdx: number, bpm: number): number {
  // "8n" = half a beat in 4/4 (since quarter note = 1 beat)
  const secondsPerBeat = 60 / bpm;
  const secondsPer8n = secondsPerBeat / 2;
  return stepIdx * secondsPer8n;
}

function addDrum(
  m: Midi,
  trackName: string,
  midiNote: number,
  steps: number[],
  bpm: number
) {
  const t = m.addTrack();
  t.name = trackName;
  t.channel = 9; // standard drum channel (10 in 1-based; 9 in 0-based)
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i]) continue;
    t.addNote({
      midi: midiNote,
      time: stepToTimeSeconds(i, bpm),
      duration: 0.05,
      velocity: 0.8,
    });
  }
}

function addPitched(m: Midi, trackName: string, steps: any[], bpm: number) {
  const t = m.addTrack();
  t.name = trackName;
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (!note) continue;
    const durSteps = note.durSteps ?? 1;
    const start = stepToTimeSeconds(i, bpm);
    const end = stepToTimeSeconds(i + durSteps, bpm);
    t.addNote({
      midi: note.midi,
      time: start,
      duration: Math.max(0.05, end - start),
      velocity: note.vel ?? 0.8,
    });
  }
}

export function patternToMidi(pattern: Pattern): Midi {
  const m = new Midi();
  m.header.setTempo(pattern.bpm);

  for (const tr of pattern.tracks) {
    if (!tr.enabled) continue;

    if (tr.kind === "drum") {
      // General MIDI drum note mapping (basic subset)
      const map: Record<string, number> = {
        kick: 36,
        snare: 38,
        hihat: 42,
        crash: 49,
        toms: 45,
      };
      addDrum(m, tr.id, map[tr.id], tr.steps, pattern.bpm);
    } else {
      addPitched(m, tr.id, tr.steps, pattern.bpm);
    }
  }

  return m;
}

// Combine multiple 8-step patterns (sequences) into a single MIDI song.
// Each sequence is placed back-to-back in time using the shared BPM.
export function sequencesToMidi(
  sequences: Pattern[],
  bpmOverride?: number
): Midi {
  const m = new Midi();
  if (!sequences.length) return m;

  const bpm = bpmOverride ?? sequences[0].bpm;
  m.header.setTempo(bpm);

  // Reuse a single track per logical instrument across all sequences.
  const drumNoteMap: Record<string, number> = {
    kick: 36,
    snare: 38,
    hihat: 42,
    crash: 49,
    toms: 45,
  };

  const drumTracks = new Map<string, any>();
  const pitchedTracks = new Map<string, any>();

  let usedUnits = 0;

  sequences.forEach((pattern) => {
    const loops = Math.max(1, pattern.loopCount ?? 1);

    for (let loopIndex = 0; loopIndex < loops; loopIndex++) {
      if (usedUnits >= MAX_TOTAL_UNITS) return;

      const baseStepOffset = usedUnits * STEPS;

      for (const tr of pattern.tracks) {
        if (!tr.enabled) continue;

        if (tr.kind === "drum") {
          const midiNote = drumNoteMap[tr.id];
          if (midiNote == null) continue;

          let t = drumTracks.get(tr.id);
          if (!t) {
            t = m.addTrack();
            t.name = tr.id;
            t.channel = 9; // GM drum channel (10 in 1-based)
            drumTracks.set(tr.id, t);
          }

          for (let i = 0; i < tr.steps.length; i++) {
            if (!tr.steps[i]) continue;
            const step = baseStepOffset + i;
            t.addNote({
              midi: midiNote,
              time: stepToTimeSeconds(step, bpm),
              duration: 0.05,
              velocity: 0.8,
            });
          }
        } else {
          let t = pitchedTracks.get(tr.id);
          if (!t) {
            t = m.addTrack();
            t.name = tr.id;
            pitchedTracks.set(tr.id, t);
          }

          for (let i = 0; i < tr.steps.length; i++) {
            const note: any = tr.steps[i];
            if (!note) continue;

            const durSteps = note.durSteps ?? 1;
            const startStep = baseStepOffset + i;
            const endStep = startStep + durSteps;
            const start = stepToTimeSeconds(startStep, bpm);
            const end = stepToTimeSeconds(endStep, bpm);

            t.addNote({
              midi: note.midi,
              time: start,
              duration: Math.max(0.05, end - start),
              velocity: note.vel ?? 0.8,
            });
          }
        }
      }

      usedUnits++;
    }
  });

  return m;
}

export function midiToBase64(m: Midi): string {
  const bytes = m.toArray();
  const bin = String.fromCharCode(...bytes);
  return btoa(bin);
}
