import { useState } from 'react';
import { Home } from './components/Home';
import { ToolShell } from './components/ToolShell';
import { NowPlayingBar } from './components/NowPlayingBar';
import { EnergyButton } from './components/EnergyButton';
import { ReminderBanner } from './components/ReminderBanner';
import { AccountButton } from './components/AccountButton';
import { useUsageLog } from './hooks/useUsageLog';
import { getTool } from './tools/registry';

function App() {
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const activeTool = activeToolId ? getTool(activeToolId) : undefined;
  const logUsage = useUsageLog();

  // Centralized here (not per-tool) so every tool, present and future, is covered
  // for free — see src/hooks/useUsageLog.ts and src/lib/usageLog.ts.
  function selectTool(id: string) {
    logUsage(id, 'opened');
    setActiveToolId(id);
  }

  return (
    <>
      <EnergyButton />
      <AccountButton />
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
        <Home onSelectTool={selectTool} />
      )}
      <NowPlayingBar />
    </>
  );
}

export default App;
