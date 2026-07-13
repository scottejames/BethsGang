import { Fragment } from 'react';
import type { ReactNode } from 'react';

export interface StructuredField {
  label: string;
  value: ReactNode;
}

interface StructuredResultProps {
  // Callers pass only the fields that actually have a value (see each tool's own
  // field-building step, using src/lib/parseLabeledOutput.ts) — an empty array means
  // "nothing parsed", which falls back to rawOutput below.
  fields: StructuredField[];
  rawOutput: string | null;
  className?: string;
}

// Shared by every AI tool whose response is either a fixed set of labeled fields, or —
// on a response that didn't parse into those fields — the raw text as a fallback.
export function StructuredResult({ fields, rawOutput, className = 'tool-result-fields' }: StructuredResultProps) {
  if (fields.length > 0) {
    return (
      <dl className={className}>
        {fields.map((field) => (
          <Fragment key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }

  return rawOutput ? <p className="tool-result-plain">{rawOutput}</p> : null;
}
