import type { ToolMeta } from '../tools/types';

interface ToolCardProps {
  meta: ToolMeta;
  onSelect: (id: string) => void;
}

export function ToolCard({ meta, onSelect }: ToolCardProps) {
  return (
    <button className="tool-card" onClick={() => onSelect(meta.id)}>
      <span className="tool-card-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="tool-card-name">{meta.name}</span>
      <span className="tool-card-tagline">{meta.tagline}</span>
    </button>
  );
}
