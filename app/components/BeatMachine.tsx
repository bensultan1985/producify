'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Track, Theme, BeatMachineState } from '../types';
import { TRACK_NAMES, INITIAL_DISABLED_TRACKS } from '../types';
import { audioEngine } from '../utils/audioEngine';
import { themes } from '../utils/themes';

const STEPS = 8;

export default function BeatMachine() {
  const [state, setState] = useState<BeatMachineState>({
    tracks: TRACK_NAMES.map((name, id) => ({
      id,
      name,
      enabled: !INITIAL_DISABLED_TRACKS.includes(id),
      steps: Array(STEPS).fill(false),
      aiGenerated: false,
    })),
    currentStep: -1,
    isPlaying: false,
    tempo: 120,
    metronomeEnabled: false,
    theme: 'black',
  });

  const [aiProcessing, setAiProcessing] = useState(false);
  const [exportEnabled, setExportEnabled] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stepDuration = (60 / state.tempo) * 1000 / 2; // Convert BPM to ms per 16th note

  const toggleStep = useCallback((trackId: number, stepIndex: number) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId
          ? { ...track, steps: track.steps.map((s, i) => (i === stepIndex ? !s : s)) }
          : track
      ),
    }));
  }, []);

  const playStep = useCallback((stepIndex: number) => {
    state.tracks.forEach(track => {
      if (track.enabled && track.steps[stepIndex]) {
        audioEngine.playTrack(track.name);
      }
    });
    
    if (state.metronomeEnabled && stepIndex === 0) {
      audioEngine.playMetronome();
    }
  }, [state.tracks, state.metronomeEnabled]);

  const startSequencer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    let currentStep = 0;
    setState(prev => ({ ...prev, isPlaying: true, currentStep: 0 }));
    playStep(0);

    intervalRef.current = setInterval(() => {
      currentStep = (currentStep + 1) % STEPS;
      setState(prev => ({ ...prev, currentStep }));
      playStep(currentStep);
    }, stepDuration);
  }, [stepDuration, playStep]);

  const stopSequencer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isPlaying: false, currentStep: -1 }));
  }, []);

  const togglePlay = () => {
    if (state.isPlaying) {
      stopSequencer();
    } else {
      startSequencer();
    }
  };

  const handleTempoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTempo = parseInt(e.target.value);
    setState(prev => ({ ...prev, tempo: newTempo }));
    
    if (state.isPlaying) {
      stopSequencer();
      setTimeout(() => startSequencer(), 50);
    }
  };

  const toggleMetronome = () => {
    setState(prev => ({ ...prev, metronomeEnabled: !prev.metronomeEnabled }));
  };

  const handleProducify = async () => {
    setAiProcessing(true);
    
    try {
      // Create MIDI-like data structure to send to AI
      const midiData = {
        tempo: state.tempo,
        tracks: state.tracks
          .filter(track => track.enabled && !track.aiGenerated)
          .map(track => ({
            name: track.name,
            steps: track.steps,
          })),
      };

      const response = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(midiData),
      });

      if (!response.ok) {
        throw new Error('AI orchestration failed');
      }

      const result = await response.json();
      
      // Update tracks 8-11 with AI-generated patterns
      setState(prev => ({
        ...prev,
        tracks: prev.tracks.map(track => {
          const aiTrack = result.tracks?.find((t: any) => t.name === track.name);
          if (aiTrack && INITIAL_DISABLED_TRACKS.includes(track.id)) {
            return {
              ...track,
              steps: aiTrack.steps,
              enabled: true,
              aiGenerated: true,
            };
          }
          return track;
        }),
      }));

      setExportEnabled(true);
    } catch (error) {
      console.error('Error during AI orchestration:', error);
      alert('AI orchestration failed. Please try again.');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleExport = () => {
    // Create a simple MIDI-like export
    const exportData = {
      tempo: state.tempo,
      tracks: state.tracks
        .filter(track => track.enabled)
        .map(track => ({
          name: track.name,
          steps: track.steps,
          aiGenerated: track.aiGenerated,
        })),
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `producify-beat-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const changeTheme = (newTheme: Theme) => {
    setState(prev => ({ ...prev, theme: newTheme }));
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const theme = themes[state.theme];

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} p-8`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Producify Beat Machine</h1>
          
          {/* Theme Selector */}
          <div className="flex gap-2">
            {(Object.keys(themes) as Theme[]).map(t => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`w-8 h-8 rounded-full border-2 ${
                  state.theme === t ? 'border-white' : 'border-transparent'
                } ${themes[t].primary}`}
                title={t}
              />
            ))}
          </div>
        </div>

        {/* Sequencer Grid */}
        <div className={`${theme.secondary} rounded-lg p-6 mb-6`}>
          <div className="grid gap-2">
            {/* Step numbers header */}
            <div className="grid grid-cols-[200px_repeat(8,1fr)] gap-2 mb-2">
              <div className="font-bold">Track</div>
              {Array.from({ length: STEPS }, (_, i) => (
                <div key={i} className="text-center font-bold">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Track rows */}
            {state.tracks.map(track => (
              <div
                key={track.id}
                className={`grid grid-cols-[200px_repeat(8,1fr)] gap-2 ${
                  !track.enabled ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center">
                  <span className={track.aiGenerated ? 'text-green-400' : ''}>
                    {track.name}
                    {track.aiGenerated && ' ✨'}
                  </span>
                </div>
                {track.steps.map((active, stepIndex) => (
                  <button
                    key={stepIndex}
                    onClick={() => track.enabled && toggleStep(track.id, stepIndex)}
                    disabled={!track.enabled}
                    className={`
                      h-12 rounded transition-all
                      ${active ? 'bg-blue-500' : theme.accent}
                      ${state.currentStep === stepIndex && state.isPlaying ? 'ring-4 ring-yellow-400' : ''}
                      ${!track.enabled ? 'cursor-not-allowed' : 'hover:brightness-110'}
                    `}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className={`${theme.secondary} rounded-lg p-6 space-y-4`}>
          {/* Play/Stop and Metronome */}
          <div className="flex gap-4 items-center">
            <button
              onClick={togglePlay}
              className={`px-8 py-3 rounded-lg font-bold ${
                state.isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
              } transition-colors`}
            >
              {state.isPlaying ? '⏹ Stop' : '▶ Play'}
            </button>

            <button
              onClick={toggleMetronome}
              className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                state.metronomeEnabled ? 'bg-blue-500 hover:bg-blue-600' : `${theme.accent} hover:brightness-110`
              }`}
            >
              🎵 Metronome {state.metronomeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Tempo Control */}
          <div className="space-y-2">
            <label className="block font-bold">Tempo: {state.tempo} BPM</label>
            <input
              type="range"
              min="60"
              max="200"
              value={state.tempo}
              onChange={handleTempoChange}
              className="w-full"
            />
          </div>

          {/* Producify and Export */}
          <div className="flex gap-4 pt-4 border-t border-gray-700">
            <button
              onClick={handleProducify}
              disabled={aiProcessing}
              className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                aiProcessing
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-purple-500 hover:bg-purple-600'
              }`}
            >
              {aiProcessing ? '⏳ Processing...' : '✨ Producify'}
            </button>

            <button
              onClick={handleExport}
              disabled={!exportEnabled}
              className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                exportEnabled
                  ? 'bg-indigo-500 hover:bg-indigo-600'
                  : 'bg-gray-500 cursor-not-allowed opacity-50'
              }`}
            >
              💾 Export
            </button>
          </div>

          <p className="text-sm opacity-75 pt-2">
            {!exportEnabled && 'Click Producify to enable AI orchestration and export.'}
            {exportEnabled && 'Ready to export! Tracks 8-11 have been orchestrated.'}
          </p>
        </div>
      </div>
    </div>
  );
}
