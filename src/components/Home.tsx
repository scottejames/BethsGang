import { tools } from '../tools/registry';
import { ToolCard } from './ToolCard';

interface HomeProps {
  onSelectTool: (id: string) => void;
}

export function Home({ onSelectTool }: HomeProps) {
  return (
    <div className="home">
      <h1>Beth's Gang</h1>
      <p className="home-subtitle">A small toolbox for getting unstuck.</p>
      <div className="tool-grid">
        {tools.map((tool) => (
          <ToolCard key={tool.meta.id} meta={tool.meta} onSelect={onSelectTool} />
        ))}
      </div>
    </div>
  );
}
