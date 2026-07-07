import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type SoundId = 'rain' | 'sea' | 'cafe' | 'pink';

export interface SoundOption {
  id: SoundId;
  label: string;
  icon: string;
  src: string;
}

// Audio credits: see README.md "Assets" section.
export const SOUNDS: SoundOption[] = [
  { id: 'rain', label: 'Rain', icon: '🌧️', src: '/audio/rain.mp3' },
  { id: 'sea', label: 'Sea', icon: '🌊', src: '/audio/sea.mp3' },
  { id: 'cafe', label: 'Cafe', icon: '☕', src: '/audio/cafe.mp3' },
  { id: 'pink', label: 'Pink Noise', icon: '🩷', src: '/audio/pink.mp3' },
];

interface DistractMeContextValue {
  activeSoundId: SoundId | null;
  volume: number;
  play: (soundId: SoundId) => void;
  stop: () => void;
  setVolume: (volume: number) => void;
}

const DistractMeContext = createContext<DistractMeContextValue | null>(null);

// Lives at the app root (see main.tsx) so the <audio> element — and playback —
// survives navigating between tools, which just mount/unmount their own UI.
export function DistractMeProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSoundId, setActiveSoundId] = useState<SoundId | null>(null);
  const [volume, setVolumeState] = useState(0.6);

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.loop = true;
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  function play(soundId: SoundId) {
    const audio = getAudio();

    if (activeSoundId === soundId) {
      audio.pause();
      setActiveSoundId(null);
      return;
    }

    const sound = SOUNDS.find((candidate) => candidate.id === soundId);
    if (!sound) return;

    audio.src = sound.src;
    audio.volume = volume;
    void audio.play();
    setActiveSoundId(soundId);
  }

  function stop() {
    audioRef.current?.pause();
    setActiveSoundId(null);
  }

  function setVolume(next: number) {
    setVolumeState(next);
    if (audioRef.current) {
      audioRef.current.volume = next;
    }
  }

  return (
    <DistractMeContext.Provider value={{ activeSoundId, volume, play, stop, setVolume }}>
      {children}
    </DistractMeContext.Provider>
  );
}

export function useDistractMe(): DistractMeContextValue {
  const context = useContext(DistractMeContext);
  if (!context) {
    throw new Error('useDistractMe must be used within a DistractMeProvider');
  }
  return context;
}
