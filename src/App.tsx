import { useState } from 'react';
import { Home } from './components/Home';
import { ToolShell } from './components/ToolShell';
import { NowPlayingBar } from './components/NowPlayingBar';
import { EnergyButton } from './components/EnergyButton';
import { ReminderBanner } from './components/ReminderBanner';
import { getTool } from './tools/registry';

function App() {
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const activeTool = activeToolId ? getTool(activeToolId) : undefined;

  return (
    <>
      <EnergyButton />
      <ReminderBanner />
      {activeTool ? (
        <ToolShell
          icon={activeTool.meta.icon}
          name={activeTool.meta.name}
          onBack={() => setActiveToolId(null)}
        >
          <activeTool.Component />
        </ToolShell>
      ) : (
        <Home onSelectTool={setActiveToolId} />
      )}
      <NowPlayingBar />
    </>
  );
}

export default App;
