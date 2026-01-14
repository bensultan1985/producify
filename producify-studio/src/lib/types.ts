export type DrumTrackId = "kick" | "snare" | "hihat" | "crash" | "toms";

export type PitchedTrackId =
  | "piano"
  | "heavySynth"
  | "strings1"
  | "strings2"
  | "strings3"
  | "sax";

export type TrackId = DrumTrackId | PitchedTrackId;

export type DrumStep = 0 | 1;

export type NoteStep = {
  midi: number; // e.g. 60 = C4
  vel?: number; // 0..1
  durSteps?: number; // default 1
} | null;

export type Track =
  | {
      id: DrumTrackId;
      kind: "drum";
      enabled: boolean;
      volume: number; // 0..1
      steps: DrumStep[]; // length 8
    }
  | {
      id: PitchedTrackId;
      kind: "pitched";
      enabled: boolean;
      volume: number; // 0..1
      steps: NoteStep[]; // length 8
    };

export type Pattern = {
  bpm: number;
  swing: number; // 0..1 (optional later)
  metronomeOn: boolean;
  metronomeVolume: number; // 0..1
  tracks: Track[];
};

export const STEPS = 8;
