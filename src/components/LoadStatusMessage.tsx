import type { LoadStatus } from '../hooks/useAccountLoadStatus';

// Stands in for a list until its data is known. `noun` completes "Couldn't load your…".
export function LoadStatusMessage({ status, noun }: { status: Exclude<LoadStatus, 'loaded'>; noun: string }) {
  return <p className="load-status">{status === 'loading' ? 'Loading…' : `Couldn't load your ${noun}.`}</p>;
}
