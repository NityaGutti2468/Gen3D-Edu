import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './theme.css';
import './account.css';
import './theme-modes.css';
import './motion.css';
import './view-mode.css';

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Gen3D-Edu render failed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <main style={{ minHeight: '100vh', padding: '48px 24px', background: 'var(--bg, #f3f6fc)', color: 'var(--text, #182338)', fontFamily: 'system-ui, sans-serif' }}>
        <section style={{ maxWidth: 760, margin: '8vh auto', padding: 28, border: '1px solid #d58b8b', borderRadius: 12, background: '#fff' }}>
          <h1 style={{ marginTop: 0 }}>This lesson could not be displayed</h1>
          <p>The lesson was generated, but the page hit a rendering error.</p>
          <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', padding: 14, borderRadius: 8, background: '#f7eeee', color: '#702c2c' }}>{String(this.state.error.message || this.state.error)}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '9px 14px', cursor: 'pointer' }}>Reload the app</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
