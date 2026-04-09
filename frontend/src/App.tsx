import { Navigate, Route, Routes } from 'react-router-dom';
import AppPage from './app/pages/AppPage';
import AppSettingsPage from './app/pages/AppSettingsPage';
import OrderPage from './app/pages/OrderPage';
import SettingsPage from './core/pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppPage />} />
      <Route path="/bestellen" element={<OrderPage />} />
      <Route path="/settings" element={<AppSettingsPage />} />
      <Route path="/settings/app" element={<Navigate to="/settings" replace />} />
      <Route path="/settings/advanced" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
