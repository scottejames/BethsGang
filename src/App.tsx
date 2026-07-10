import { Home } from './components/Home';
import { ToolShell } from './components/ToolShell';
import { NowPlayingBar } from './components/NowPlayingBar';
import { EnergyButton } from './components/EnergyButton';
import { AlertBanner } from './components/AlertBanner';
import { AccountButton } from './components/AccountButton';
import { useToolNavigation } from './context/ToolNavigationContext';
import { getTool } from './tools/registry';

function App() {
  // activeToolId/navigateToTool/goHome live in ToolNavigationContext (not local state
  // here) specifically so a tool can navigate to another tool, not just Home — see
  // ToolNavigationContext.tsx. That's also where the "opened" usage-log event fires
  // now, covering every navigation path uniformly.
  const { activeToolId, navigateToTool, goHome } = useToolNavigation();
  const activeTool = activeToolId ? getTool(activeToolId) : undefined;

  return (
    <>
      <EnergyButton />
      <AccountButton />
      <AlertBanner />
      {activeTool ? (
        <ToolShell icon={activeTool.meta.icon} name={activeTool.meta.name} onBack={goHome}>
          <activeTool.Component />
        </ToolShell>
      ) : (
        <Home onSelectTool={navigateToTool} />
      )}
      <NowPlayingBar />
    </>
  );
}

export default App;
