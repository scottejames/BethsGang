import { cleanup, render } from '@testing-library/react';
import { vi } from 'vitest';
import type { ComponentType, ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../context/AuthContext';
import { EnergyProvider } from '../context/EnergyContext';
import { runAiTool } from '../lib/aiClient';

// Shared setup for AI tool component tests. The test file itself must declare vi.mock
// for 'aws-amplify/auth', 'aws-amplify/utils', and '../../lib/aiClient', because vi.mock
// only applies from the file that calls it.

const ENERGY_KEY = 'beths-gang:energy-spoons';

function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>{children}</EnergyProvider>
    </AuthProvider>
  );
}

export function renderAiTool(Component: ComponentType) {
  return render(<Component />, { wrapper: Providers });
}

export function resetAiToolMocks() {
  window.localStorage.removeItem(ENERGY_KEY);
  vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
  vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  vi.mocked(runAiTool).mockReset();
}

export function cleanupAiTool() {
  cleanup();
  window.localStorage.removeItem(ENERGY_KEY);
}

// The tool's own payload, unwrapped from the { spoons, input } energy envelope.
export function sentPayload(call = 0) {
  const [, envelope] = vi.mocked(runAiTool).mock.calls[call];
  return JSON.parse(JSON.parse(envelope).input);
}

// A response the test finishes by hand, to observe the in-flight loading state.
export function pendingResponse() {
  let resolve: (value: string) => void = () => {};
  vi.mocked(runAiTool).mockReturnValue(
    new Promise<string>((done) => {
      resolve = done;
    }),
  );
  return (value: string) => resolve(value);
}
