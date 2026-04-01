import { Navigate, Route, Routes } from 'react-router-dom';
import AppPage from './app/pages/AppPage';
import AppSettingsPage from './app/pages/AppSettingsPage';
import OrderPage from './app/pages/OrderPage';
import CoreRouteGuard from './core/components/CoreRouteGuard';
import SettingsPage from './core/pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <CoreRouteGuard
            scope="app"
            settingsLink={{ to: '/settings', label: 'Naar instellingen', requireSettingsAllowed: true }}
          >
            <AppPage />
          </CoreRouteGuard>
        }
      />
      <Route
        path="/bestellen"
        element={
          <CoreRouteGuard
            scope="app"
            settingsLink={{ to: '/settings', label: 'Naar instellingen', requireSettingsAllowed: true }}
          >
            <OrderPage />
          </CoreRouteGuard>
        }
      />
      <Route
        path="/settings"
        element={
          <CoreRouteGuard
            scope="settings"
            settingsLink={{ to: '/settings/advanced', label: 'Geavanceerde instellingen', requireSettingsAllowed: false }}
          >
            <AppSettingsPage />
          </CoreRouteGuard>
        }
      />
      <Route path="/settings/app" element={<Navigate to="/settings" replace />} />
      <Route
        path="/settings/advanced"
        element={
          <CoreRouteGuard scope="settings">
            <SettingsPage />
          </CoreRouteGuard>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
