import { tools } from '../tools/registry';
import type { ToolCategory } from '../tools/types';
import { ToolCard } from './ToolCard';
import { useReminders } from '../context/RemindersContext';
import { useToolNavigation } from '../context/ToolNavigationContext';
import logo from '../assets/logo.png';

interface HomeProps {
  onSelectTool: (id: string) => void;
}

const TABS: { id: ToolCategory; label: string }[] = [
  { id: 'general', label: 'Everyday Helpers' },
  { id: 'planning', label: 'Get Organized' },
];

export function Home({ onSelectTool }: HomeProps) {
  const { reminders } = useReminders();
  // Lives in ToolNavigationContext, not local state — see its own comment for why:
  // local state here would reset to the default every time Home remounts after
  // going back from a tool, regardless of which tab that tool was actually opened
  // from.
  const { activeCategory, setActiveCategory } = useToolNavigation();

  // Only Remind Me has a meaningful "active count" today — extend this if another
  // tool grows one rather than adding a generic mechanism nothing else needs yet.
  function badgeCountFor(toolId: string): number | undefined {
    return toolId === 'remind-me' ? reminders.length : undefined;
  }

  const visibleTools = tools.filter((tool) => tool.meta.category === activeCategory);

  return (
    <div className="home">
      <div className="home-header">
        <h1 className="home-heading">
          <img src={logo} alt="Beth's Gang" className="home-logo" />
        </h1>
        <p className="home-subtitle">A small toolbox for getting unstuck.</p>
      </div>
      <span className="home-rainbow-bar" aria-hidden="true" />

      {/* Not role="tablist"/"tab" — that ARIA pattern implies arrow-key navigation
          and an aria-controls-linked tabpanel, neither of which this simple
          category filter implements. A labeled toggle-button group is the accurate,
          simpler contract for what this actually is. */}
      <div className="home-tabs" role="group" aria-label="Tool category">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeCategory === tab.id}
            className={`home-tab${activeCategory === tab.id ? ' home-tab-active' : ''}`}
            onClick={() => setActiveCategory(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tool-grid">
        {visibleTools.map((tool) => (
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
