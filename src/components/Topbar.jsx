import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function Topbar({ title, subtitle }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('labdiag-theme-v2') || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('labdiag-theme-v2', theme);
  }, [theme]);

  return (
    <header className="app-topbar">
      {/* Page heading */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      <button
        className="theme-toggle"
        onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </button>

    </header>
  );
}
