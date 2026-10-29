import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout({ children, title, subtitle }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content">
        <Topbar title={title} subtitle={subtitle} />
        <main className="app-main">
          {children}
        </main>
      </div>
    </div>
  );
}
