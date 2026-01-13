export type Theme = 'black' | 'gray' | 'white' | 'violet' | 'purple' | 'blue';

export interface Track {
  id: number;
  name: string;
  enabled: boolean;
  steps: boolean[];
  aiGenerated?: boolean;
}

export interface BeatMachineState {
  tracks: Track[];
  currentStep: number;
  isPlaying: boolean;
  tempo: number;
  metronomeEnabled: boolean;
  theme: Theme;
}

export const TRACK_NAMES = [
  'Kick',
  'Snare',
  'Hi-Hat',
  'Crash',
  'Piano',
  'Heavy Synth',
  'String',
  'X String',
  'XX String',
  'Tom',
  'Sax',
] as const;

export const INITIAL_DISABLED_TRACKS = [7, 8, 9, 10]; // indices for X String, XX String, Tom, Sax
