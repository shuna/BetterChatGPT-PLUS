import React, { Component, type ErrorInfo, type ReactNode } from 'react';

const DB_NAME = 'weavelet-canvas';
const DB_VERSION = 1;
const STORE_NAME = 'persisted-state';
const CHAT_DATA_KEY = 'chat-data';
const LS_KEY = 'free-chat-gpt';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  exporting: boolean;
  exported: boolean;
}

/**
 * Top-level Error Boundary that catches render crashes and provides
 * an emergency data-export button so the user can save their local data
 * even when the app is unable to render.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, exporting: false, exported: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  /** Read raw chat data directly from IndexedDB, bypassing Zustand. */
  private readIndexedDb = (): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const get = store.get(CHAT_DATA_KEY);
          get.onsuccess = () => resolve(get.result ?? null);
          get.onerror = () => reject(get.error);
        } catch {
          resolve(null);
        } finally {
          db.close();
        }
      };
    });

  /** Read localStorage settings (may be lz-string compressed). */
  private readLocalStorage = (): unknown => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      // Return raw string if it's compressed / not parseable
      return localStorage.getItem(LS_KEY);
    }
  };

  private handleExport = async () => {
    this.setState({ exporting: true });
    try {
      const [chatData, lsData] = await Promise.all([
        this.readIndexedDb().catch(() => null),
        Promise.resolve(this.readLocalStorage()),
      ]);

      const payload = {
        _emergencyExport: true,
        exportedAt: new Date().toISOString(),
        indexedDb: chatData,
        localStorage: lsData,
      };

      const json = JSON.stringify(payload);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emergency-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.setState({ exported: true });
    } catch (e) {
      console.error('[ErrorBoundary] Export failed:', e);
      alert('Export failed. Check the browser console for details.');
    } finally {
      this.setState({ exporting: false });
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#111',
          color: '#e5e5e5',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: '#999', maxWidth: 480, marginBottom: 24 }}>
          The app crashed during rendering. You can export your local data
          before reloading.
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={this.handleExport}
            disabled={this.state.exporting}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: this.state.exported ? '#16a34a' : '#2563eb',
              color: '#fff',
            }}
          >
            {this.state.exporting
              ? 'Exporting...'
              : this.state.exported
                ? 'Exported!'
                : 'Export Data'}
          </button>

          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid #555',
              cursor: 'pointer',
              background: 'transparent',
              color: '#e5e5e5',
            }}
          >
            Reload
          </button>
        </div>

        <details
          style={{ marginTop: 32, maxWidth: 600, textAlign: 'left', fontSize: 12, color: '#777' }}
        >
          <summary style={{ cursor: 'pointer' }}>Error details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>
            {this.state.error?.stack ?? this.state.error?.message ?? 'Unknown error'}
          </pre>
        </details>
      </div>
    );
  }
}

export default ErrorBoundary;
