import { Navigate, Route, Routes } from 'react-router-dom';
import AppPage from './pages/AppPage';
import OrderPage from './pages/OrderPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppPage />} />
      <Route path="/bestellen" element={<OrderPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}



