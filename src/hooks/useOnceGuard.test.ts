import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useOnceGuard } from './useOnceGuard';

describe('useOnceGuard', () => {
  it('has not fired to begin with', () => {
    const { result } = renderHook(() => useOnceGuard());

    expect(result.current.hasFired()).toBe(false);
  });

  it('remembers firing immediately, without waiting for a re-render', () => {
    const { result } = renderHook(() => useOnceGuard());

    result.current.markFired();

    expect(result.current.hasFired()).toBe(true);
  });

  it('can fire again after a reset', () => {
    const { result } = renderHook(() => useOnceGuard());
    result.current.markFired();

    result.current.reset();

    expect(result.current.hasFired()).toBe(false);
  });

  it('remembers firing across re-renders', () => {
    const { result, rerender } = renderHook(() => useOnceGuard());
    result.current.markFired();

    rerender();

    expect(result.current.hasFired()).toBe(true);
  });
});
