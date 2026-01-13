// Audio engine for generating drum and instrument sounds using Web Audio API

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.3; // Master volume
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.frequency.value = frequency;
    osc.type = type;

    gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  }

  private playNoise(duration: number, volume: number = 0.3) {
    if (!this.audioContext || !this.masterGain) return;

    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioContext.createBufferSource();
    const filter = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();

    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    noise.start(this.audioContext.currentTime);
  }

  playKick() {
    if (!this.audioContext || !this.masterGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.frequency.setValueAtTime(150, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.1);
    
    gain.gain.setValueAtTime(1, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
    
    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + 0.3);
  }

  playSnare() {
    if (!this.audioContext || !this.masterGain) return;
    
    // Tone component
    this.playTone(200, 0.15, 'triangle', 0.2);
    
    // Noise component
    this.playNoise(0.15, 0.3);
  }

  playHiHat() {
    this.playNoise(0.05, 0.2);
  }

  playCrash() {
    this.playNoise(0.8, 0.15);
  }

  playPiano() {
    // C4 piano note
    this.playTone(261.63, 0.5, 'sine', 0.25);
  }

  playHeavySynth() {
    // Heavy bass synth
    this.playTone(82.41, 0.4, 'sawtooth', 0.3);
  }

  playString() {
    // String pad sound
    this.playTone(220, 0.6, 'sine', 0.2);
  }

  playXString() {
    this.playTone(329.63, 0.6, 'sine', 0.2);
  }

  playXXString() {
    this.playTone(440, 0.6, 'sine', 0.2);
  }

  playTom() {
    if (!this.audioContext || !this.masterGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.frequency.setValueAtTime(120, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.audioContext.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
    
    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + 0.2);
  }

  playSax() {
    // Saxophone-like sound
    this.playTone(293.66, 0.5, 'sawtooth', 0.25);
  }

  playMetronome() {
    this.playTone(800, 0.05, 'sine', 0.15);
  }

  playTrack(trackName: string) {
    switch (trackName.toLowerCase()) {
      case 'kick':
        this.playKick();
        break;
      case 'snare':
        this.playSnare();
        break;
      case 'hi-hat':
        this.playHiHat();
        break;
      case 'crash':
        this.playCrash();
        break;
      case 'piano':
        this.playPiano();
        break;
      case 'heavy synth':
        this.playHeavySynth();
        break;
      case 'string':
        this.playString();
        break;
      case 'x string':
        this.playXString();
        break;
      case 'xx string':
        this.playXXString();
        break;
      case 'tom':
        this.playTom();
        break;
      case 'sax':
        this.playSax();
        break;
    }
  }

  dispose() {
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

export const audioEngine = new AudioEngine();
