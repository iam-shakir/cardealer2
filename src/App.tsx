import React from 'react';
import {
  DealershipProvider,
  useDealership,
} from './context/DealershipContext';
import { AppShell } from './components/AppShell';
import { AssistantDrawer } from './components/AssistantDrawer';
import { WorkspaceModals } from './components/WorkspaceModals';
import {
  DashboardView,
  InventoryView,
} from './views/DashboardAndInventory';
import {
  ClientsView,
  ExpensesView,
  PartsView,
  SalesView,
} from './views/OperationsViews';
import {
  FinanceView,
  IdeasView,
  ReportsView,
  SettingsView,
  TeamView,
} from './views/ManagementViews';

const ActiveRouteRenderer: React.FC = () => {
  const { activeRoute } = useDealership();

  switch (activeRoute) {
    case 'dashboard':
      return <DashboardView />;
    case 'inventory':
      return <InventoryView />;
    case 'expenses':
      return <ExpensesView />;
    case 'sales':
      return <SalesView />;
    case 'clients':
      return <ClientsView />;
    case 'parts':
      return <PartsView />;
    case 'finance':
      return <FinanceView />;
    case 'reports':
      return <ReportsView />;
    case 'ideas':
      return <IdeasView />;
    case 'team':
      return <TeamView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
};

export default function App() {
  return (
    <DealershipProvider>
      <AppShell>
        <ActiveRouteRenderer />
      </AppShell>
      <AssistantDrawer />
      <WorkspaceModals />
    </DealershipProvider>
  );
}
