import { useState } from 'react';
import { Home } from './components/Home';
import { ToolShell } from './components/ToolShell';
import { getTool } from './tools/registry';

function App() {
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const activeTool = activeToolId ? getTool(activeToolId) : undefined;

  if (activeTool) {
    const { Component } = activeTool;
    return (
      <ToolShell
        icon={activeTool.meta.icon}
        name={activeTool.meta.name}
        onBack={() => setActiveToolId(null)}
      >
        <Component />
      </ToolShell>
    );
  }

  return <Home onSelectTool={setActiveToolId} />;
}

export default App;
