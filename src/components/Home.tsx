import { tools, getTool } from '../tools/registry';
import { ToolCard } from './ToolCard';
import logo from '../assets/logo.png';
import type { ToolDefinition } from '../tools/types';

interface HomeProps {
  onSelectTool: (id: string) => void;
}

// Grouped by feel, not build order: "doing" tools help you get moving on a task,
// "saying" tools help you word something to someone. Kept as explicit id groups
// (not an interleaved array-index trick) so the grouping holds regardless of how
// many columns the viewport happens to render the grid at.
const DOING_GROUP = ['distract-me', 'pomodoro-timer', 'task-breakdown'];
const SAYING_GROUP = ['reply-starter', 'tone-checker', 'is-this-mad', 'call-script'];

function lookupTools(ids: string[]): ToolDefinition[] {
  return ids.map(getTool).filter((tool): tool is ToolDefinition => Boolean(tool));
}

export function Home({ onSelectTool }: HomeProps) {
  const doingTools = lookupTools(DOING_GROUP);
  const sayingTools = lookupTools(SAYING_GROUP);

  // Safety net: a tool added to registry.ts but not to either group above still
  // shows up here instead of silently vanishing from Home.
  const groupedIds = new Set([...DOING_GROUP, ...SAYING_GROUP]);
  const ungroupedTools = tools.filter((tool) => !groupedIds.has(tool.meta.id));

  return (
    <div className="home">
      <div className="home-header">
        <h1 className="home-heading">
          <img src={logo} alt="Beth's Gang" className="home-logo" />
        </h1>
        <p className="home-subtitle">A small toolbox for getting unstuck.</p>
      </div>
      <span className="home-rainbow-bar" aria-hidden="true" />
      <div className="tool-columns">
        <div className="tool-column">
          {doingTools.map((tool) => (
            <ToolCard key={tool.meta.id} meta={tool.meta} onSelect={onSelectTool} />
          ))}
        </div>
        <div className="tool-column">
          {sayingTools.map((tool) => (
            <ToolCard key={tool.meta.id} meta={tool.meta} onSelect={onSelectTool} />
          ))}
        </div>
      </div>
      {ungroupedTools.length > 0 && (
        <div className="tool-grid">
          {ungroupedTools.map((tool) => (
            <ToolCard key={tool.meta.id} meta={tool.meta} onSelect={onSelectTool} />
          ))}
        </div>
      )}
    </div>
  );
}
