import { Pattern, STEPS, Track } from "./types";

function drum(id: any, enabled: boolean, volume: number = 1): Track {
  return { id, kind: "drum", enabled, volume, steps: Array(STEPS).fill(0) };
}
function pitched(id: any, enabled: boolean, volume: number = 1): Track {
  return {
    id,
    kind: "pitched",
    enabled,
    volume,
    steps: Array(STEPS).fill(null),
  };
}

export const defaultPattern: Pattern = {
  bpm: 110,
  swing: 0,
  metronomeOn: false,
  metronomeVolume: 0.5,
  tracks: [
    drum("kick", true),
    drum("snare", true),
    drum("hihat", true),
    drum("crash", true),

    pitched("piano", true),
    pitched("heavySynth", true),
    pitched("strings1", true),

    // initially disabled “AI-arranged” tracks
    pitched("strings2", false),
    pitched("strings3", false),
    drum("toms", false),
    pitched("sax", false),
  ],
};
