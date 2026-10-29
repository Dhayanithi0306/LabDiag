import { Settings, SunMoon } from 'lucide-react';
import Layout from '../components/Layout';

export default function SettingsPage() {
  return (
    <Layout title="Settings" subtitle="Application preferences">
      <div className="card settings-empty-card">
        <div className="settings-empty-icon"><Settings size={20} /></div>
        <div>
          <h2 className="card-header-title">No system settings available</h2>
          <p className="settings-empty-copy">
            This version does not connect to a backend or save configurable diagnostic rules.
            Use the appearance control in the top bar to switch between light and dark mode.
          </p>
          <div className="settings-available"><SunMoon size={15} /> Appearance is available in the top bar</div>
        </div>
      </div>
    </Layout>
  );
}
