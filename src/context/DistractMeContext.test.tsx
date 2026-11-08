import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NowPlayingBar } from '../components/NowPlayingBar';
import { distractMeTool } from '../tools/distractMe';
import { DistractMeProvider, useDistractMe } from './DistractMeContext';

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

const playingElement = () => play.mock.contexts.at(-1) as unknown as HTMLAudioElement;

beforeEach(() => {
  play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pause = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DistractMeContext', () => {
  const renderContext = () => renderHook(() => useDistractMe(), { wrapper: DistractMeProvider });

  it('starts silent', () => {
    const { result } = renderContext();

    expect(result.current.activeSoundId).toBeNull();
    expect(result.current.activeSound).toBeNull();
  });

  it('plays the chosen sound on a loop at the current volume', () => {
    const { result } = renderContext();

    act(() => result.current.play('rain'));

    expect(play).toHaveBeenCalledTimes(1);
    expect(playingElement().src).toContain('/audio/rain.mp3');
    expect(playingElement().loop).toBe(true);
    expect(playingElement().volume).toBe(0.6);
    expect(result.current.activeSound?.label).toBe('Rain');
  });

  it('turns a sound off when it is picked again', () => {
    const { result } = renderContext();
    act(() => result.current.play('rain'));

    act(() => result.current.play('rain'));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(result.current.activeSoundId).toBeNull();
  });

  it('switches directly to a different sound', () => {
    const { result } = renderContext();
    act(() => result.current.play('rain'));

    act(() => result.current.play('sea'));

    expect(playingElement().src).toContain('/audio/sea.mp3');
    expect(result.current.activeSoundId).toBe('sea');
  });

  it('stops playback', () => {
    const { result } = renderContext();
    act(() => result.current.play('cafe'));

    act(() => result.current.stop());

    expect(pause).toHaveBeenCalledTimes(1);
    expect(result.current.activeSound).toBeNull();
  });

  it('changes the volume of a sound that is already playing', () => {
    const { result } = renderContext();
    act(() => result.current.play('rain'));

    act(() => result.current.setVolume(0.2));

    expect(playingElement().volume).toBe(0.2);
    expect(result.current.volume).toBe(0.2);
  });

  it('remembers a volume set before anything is playing', () => {
    const { result } = renderContext();
    act(() => result.current.setVolume(0.25));

    act(() => result.current.play('pink'));

    expect(playingElement().volume).toBe(0.25);
  });
});

describe('NowPlayingBar', () => {
  function renderBar() {
    return render(
      <DistractMeProvider>
        <NowPlayingBar />
        <distractMeTool.Component />
      </DistractMeProvider>,
    );
  }

  const stopButtons = () => screen.queryAllByRole('button', { name: 'Stop' });

  it('is hidden until something is playing', () => {
    renderBar();

    expect(screen.queryByText(/^Playing:/)).not.toBeInTheDocument();
  });

  it('shows what is playing, and can stop it', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /sea/i }));
    expect(screen.getByText('Playing: Sea')).toBeInTheDocument();

    fireEvent.click(stopButtons()[0]);

    expect(screen.queryByText('Playing: Sea')).not.toBeInTheDocument();
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('changes the volume from its slider', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /sea/i }));

    const [barSlider] = screen.getAllByRole('slider', { name: 'Volume' });
    fireEvent.change(barSlider, { target: { value: '0.3' } });

    expect(playingElement().volume).toBeCloseTo(0.3);
  });
});

describe('Distract Me tool', () => {
  function renderTool() {
    return render(
      <DistractMeProvider>
        <distractMeTool.Component />
      </DistractMeProvider>,
    );
  }

  it('offers every sound, with no controls until one is playing', () => {
    renderTool();

    for (const label of [/rain/i, /sea/i, /cafe/i, /pink noise/i]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('highlights the playing sound and shows the controls', () => {
    renderTool();

    const rain = screen.getByRole('button', { name: /rain/i });
    fireEvent.click(rain);

    expect(rain).toHaveClass('preset-button-active');
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
  });

  it('hides the controls again after stopping', () => {
    renderTool();
    fireEvent.click(screen.getByRole('button', { name: /rain/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
