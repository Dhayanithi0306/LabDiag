import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard    from './pages/Dashboard';
import UploadPage   from './pages/UploadPage';
import ResultsPage  from './pages/ResultsPage';
import DeviceDetail from './pages/DeviceDetail';
import RepairPage   from './pages/RepairPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                         element={<Dashboard />} />
        <Route path="/upload"                   element={<UploadPage />} />
        <Route path="/results"                  element={<ResultsPage />} />
        <Route path="/device/:id"               element={<DeviceDetail />} />
        <Route path="/repair/:deviceId/:faultId" element={<RepairPage />} />
        <Route path="/settings"                 element={<SettingsPage />} />
        {/* 404 fallback */}
        <Route path="*" element={
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', flexDirection: 'column', gap: 12,
            color: 'var(--text-muted)', background: 'var(--bg-base)',
          }}>
            <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-primary)' }}>404</div>
            <div>Page not found</div>
            <a href="/" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>Go to Dashboard</a>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
