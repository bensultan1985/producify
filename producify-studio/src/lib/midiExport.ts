import { Midi } from "@tonejs/midi";
import { Pattern, STEPS, Track } from "./types";

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

export function midiToBase64(m: Midi): string {
  const bytes = m.toArray();
  const bin = String.fromCharCode(...bytes);
  return btoa(bin);
}
