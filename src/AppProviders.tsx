import type { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import { DistractMeProvider } from './context/DistractMeContext';
import { EnergyProvider } from './context/EnergyContext';
import { RemindersProvider } from './context/RemindersContext';
import { TaskStoreProvider } from './context/TaskStoreContext';
import { TimetableProvider } from './context/TimetableContext';
import { ToolNavigationProvider } from './context/ToolNavigationContext';

// Shared by main.tsx and App.test.tsx, so the whole-app test runs the real provider order.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>
        <DistractMeProvider>
          <RemindersProvider>
            <TimetableProvider>
              <TaskStoreProvider>
                <ToolNavigationProvider>{children}</ToolNavigationProvider>
              </TaskStoreProvider>
            </TimetableProvider>
          </RemindersProvider>
        </DistractMeProvider>
      </EnergyProvider>
    </AuthProvider>
  );
}
