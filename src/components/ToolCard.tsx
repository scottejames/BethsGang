import type { ToolMeta } from '../tools/types';

interface ToolCardProps {
  meta: ToolMeta;
  onSelect: (id: string) => void;
  badgeCount?: number;
}

export function ToolCard({ meta, onSelect, badgeCount }: ToolCardProps) {
  return (
    <button className="tool-card" onClick={() => onSelect(meta.id)}>
      {Boolean(badgeCount) && (
        <span className="tool-card-badge" aria-hidden="true">
          {badgeCount}
        </span>
      )}
      <span className="tool-card-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="tool-card-name">
        {meta.name}
        {Boolean(badgeCount) && (
          <span className="sr-only">, {badgeCount} active reminder{badgeCount === 1 ? '' : 's'}</span>
        )}
      </span>
      <span className="tool-card-tagline">{meta.tagline}</span>
    </button>
  );
}
