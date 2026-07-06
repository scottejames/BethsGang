import type { ReactNode } from 'react';

interface ToolShellProps {
  icon: string;
  name: string;
  onBack: () => void;
  children: ReactNode;
}

export function ToolShell({ icon, name, onBack, children }: ToolShellProps) {
  return (
    <div className="tool-shell">
      <button className="back-button" onClick={onBack}>
        ← All tools
      </button>
      <h1>
        <span aria-hidden="true">{icon}</span> {name}
      </h1>
      {children}
    </div>
  );
}
