import { tools } from '../tools/registry';
import { ToolCard } from './ToolCard';
import { useReminders } from '../context/RemindersContext';
import logo from '../assets/logo.png';

interface HomeProps {
  onSelectTool: (id: string) => void;
}

export function Home({ onSelectTool }: HomeProps) {
  const { reminders } = useReminders();

  // Only Remind Me has a meaningful "active count" today — extend this if another
  // tool grows one rather than adding a generic mechanism nothing else needs yet.
  function badgeCountFor(toolId: string): number | undefined {
    return toolId === 'remind-me' ? reminders.length : undefined;
  }

  return (
    <div className="home">
      <div className="home-header">
        <h1 className="home-heading">
          <img src={logo} alt="Beth's Gang" className="home-logo" />
        </h1>
        <p className="home-subtitle">A small toolbox for getting unstuck.</p>
      </div>
      <span className="home-rainbow-bar" aria-hidden="true" />
      <div className="tool-grid">
        {tools.map((tool) => (
          <ToolCard
            key={tool.meta.id}
            meta={tool.meta}
            onSelect={onSelectTool}
            badgeCount={badgeCountFor(tool.meta.id)}
          />
        ))}
      </div>
    </div>
  );
}
