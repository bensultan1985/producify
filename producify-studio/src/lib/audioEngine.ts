import * as Tone from "tone";
import { Pattern, Track, STEPS } from "./types";

type Engine = {
  start: () => Promise<void>;
  stop: () => void;
  setPattern: (p: Pattern) => void;
  setBpm: (bpm: number) => void;
  setMetronome: (on: boolean) => void;
  setMetronomeVolume: (v: number) => void;
  setOnTick: (cb: (step: number) => void) => void;
  getMetronomeLevel: () => number; // 0..1-ish
};

let _step = 0;

export function createAudioEngine(initial: Pattern): Engine {
  let pattern = initial;
  let onTick: (step: number) => void = () => {};

  // Master
  const master = new Tone.Gain(0.9).toDestination();

  // --- Metronome chain (separate volume + meter)
  const metroGain = new Tone.Gain(pattern.metronomeVolume).connect(master);
  const metroAnalyser = new Tone.Analyser("waveform", 256);
  metroGain.connect(metroAnalyser);

  const metroSynth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
  }).connect(metroGain);

  function metroLevel(): number {
    // crude level estimate from waveform
    const arr = metroAnalyser.getValue() as Float32Array;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += Math.abs(arr[i]);
    return Math.min(1, (sum / arr.length) * 4);
  }

  // --- Drum “sampler-ish” synths (simple but works; swap for samples later)
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 8 }).connect(
    master
  );
  const snare = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
  }).connect(master);
  const hihat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  }).connect(master);
  const crash = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.2, release: 0.2 },
    harmonicity: 8,
    modulationIndex: 64,
    resonance: 5000,
    octaves: 2,
  }).connect(master);

  const toms = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2 }).connect(
    master
  );

  // --- Pitched instruments
  const piano = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
  }).connect(master);

  const heavySynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.15 },
  }).connect(master);

  const strings = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
  }).connect(master);

  const sax = new Tone.MonoSynth({
    oscillator: { type: "sawtooth" },
    filter: { Q: 2, type: "lowpass", rolloff: -24 },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.2 },
    filterEnvelope: {
      attack: 0.02,
      decay: 0.1,
      sustain: 0.2,
      release: 0.2,
      baseFrequency: 200,
      octaves: 2,
    },
  }).connect(master);

  function playTrackStep(t: Track, stepIdx: number, time: number) {
    if (!t.enabled) return;

    // Per-track volume (0..1), with a small floor to avoid complete silence
    // accidentally; drum base levels are tuned per instrument.
    const trackVol = Math.max(0, Math.min(1, (t as any).volume ?? 1));

    if (t.kind === "drum") {
      if (!t.steps[stepIdx]) return;

      switch (t.id) {
        case "kick":
          kick.triggerAttackRelease("C1", "8n", time, 0.9 * trackVol);
          break;
        case "snare":
          snare.triggerAttackRelease("8n", time, 0.6 * trackVol);
          break;
        case "hihat":
          hihat.triggerAttackRelease("C6", "16n", time, 0.25 * trackVol);
          break;
        case "crash":
          crash.triggerAttackRelease("C5", "2n", time, 0.35 * trackVol);
          break;
        case "toms":
          toms.triggerAttackRelease("G2", "8n", time, 0.7 * trackVol);
          break;
      }
      return;
    }

    const note = t.steps[stepIdx];
    if (!note) return;

    const durSteps = note.durSteps ?? 1;
    const dur = durSteps === 1 ? "8n" : `${durSteps * 0.5}n`; // coarse; refine later
    const baseVel = note.vel ?? 0.8;
    const vel = baseVel * trackVol;

    const freq = Tone.Frequency(note.midi, "midi");

    switch (t.id) {
      case "piano":
        piano.triggerAttackRelease(freq.toNote(), "8n", time, vel);
        break;
      case "heavySynth":
        heavySynth.triggerAttackRelease(freq.toNote(), "8n", time, vel);
        break;
      case "strings1":
      case "strings2":
      case "strings3":
        strings.triggerAttackRelease(freq.toNote(), "8n", time, vel);
        break;
      case "sax":
        sax.triggerAttackRelease(freq.toNote(), "8n", time, vel);
        break;
    }
  }

  // Scheduler
  const loop = new Tone.Loop((time) => {
    const stepIdx = _step % STEPS;

    // metronome on every step (you can change to quarter-notes easily)
    if (pattern.metronomeOn) {
      // accent first beat
      const vel = stepIdx === 0 ? 0.9 : 0.4;
      metroSynth.triggerAttackRelease("C6", "32n", time, vel);
    }

    for (const t of pattern.tracks) {
      playTrackStep(t, stepIdx, time);
    }

    onTick(stepIdx);
    _step++;
  }, "8n"); // 8 steps -> 1 bar in 4/4 if you interpret as 8th notes

  function setBpm(bpm: number) {
    Tone.Transport.bpm.value = bpm;
  }

  function startStopReset() {
    _step = 0;
  }

  return {
    start: async () => {
      await Tone.start();
      setBpm(pattern.bpm);
      startStopReset();
      loop.start(0);
      Tone.Transport.start();
    },
    stop: () => {
      loop.stop();
      Tone.Transport.stop();
      startStopReset();
    },
    setPattern: (p: Pattern) => {
      pattern = p;
      setBpm(p.bpm);
      metroGain.gain.value = p.metronomeVolume;
    },
    setBpm,
    setMetronome: (on: boolean) => {
      pattern = { ...pattern, metronomeOn: on };
    },
    setMetronomeVolume: (v: number) => {
      metroGain.gain.value = v;
      pattern = { ...pattern, metronomeVolume: v };
    },
    setOnTick: (cb) => {
      onTick = cb;
    },
    getMetronomeLevel: () => metroLevel(),
  };
}
