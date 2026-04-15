import { Navigate, Route, Routes } from 'react-router-dom';
import AppPage from './app/pages/AppPage';
import AppSettingsPage from './app/pages/AppSettingsPage';
import OrderPage from './app/pages/OrderPage';
import GuardedRouteWithOverride from './GuardedRouteWithOverride';
import SettingsPage from './core/pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <GuardedRouteWithOverride
            scope="app"
            settingsLink={{ to: '/settings', label: 'Naar instellingen', requireSettingsAllowed: true }}
          >
            <AppPage />
          </GuardedRouteWithOverride>
        }
      />
      <Route
        path="/bestellen"
        element={
          <GuardedRouteWithOverride
            scope="app"
            settingsLink={{ to: '/settings', label: 'Naar instellingen', requireSettingsAllowed: true }}
          >
            <OrderPage />
          </GuardedRouteWithOverride>
        }
      />
      <Route
        path="/settings"
        element={
          <GuardedRouteWithOverride
            scope="settings"
            settingsLink={{ to: '/settings/advanced', label: 'Geavanceerde instellingen', requireSettingsAllowed: false }}
          >
            <AppSettingsPage />
          </GuardedRouteWithOverride>
        }
      />
      <Route path="/settings/app" element={<Navigate to="/settings" replace />} />
      <Route
        path="/settings/advanced"
        element={
          <GuardedRouteWithOverride scope="settings">
            <SettingsPage />
          </GuardedRouteWithOverride>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
