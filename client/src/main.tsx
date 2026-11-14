import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/base.css';
import './theme/components.css';
import { App } from './App';
import { setNumberLocale } from './data/format';
import { missingKeys, setLanguage } from './i18n';
import type { Connection } from './net/connection';
import { createWsConnection } from './net/wsConnection';
import { applyPrefsToDocument, loadPrefs, Store, StoreContext } from './state/store';

async function boot() {
  const query = new URLSearchParams(location.search);
  const prefs = loadPrefs();
  setNumberLocale(prefs.lang);
  await setLanguage(prefs.lang);

  // `?mock=1` runs a scripted session against a room server that lives in this page.
  let conn: Connection;
  if (query.get('mock') === '1') {
    const { createMockConnection } = await import('./net/mock');
    const mock = createMockConnection(prefs.lang, { speed: Number(query.get('speed')) || 1 });
    conn = mock;
    // Test and demo hooks (mock mode only): drop the connection, list missing strings.
    (window as unknown as { __mf: unknown }).__mf = { room: mock.room, drop: () => mock.room.dropConnection(), missing: missingKeys };
  } else {
    conn = createWsConnection(prefs.lang);
  }

  const store = new Store(conn, prefs);
  applyPrefsToDocument(store.getState());

  // A refresh keeps the seat: re-attach with the token kept in sessionStorage, unless the QR
  // code points at a different room.
  const room = (query.get('room') ?? '').toUpperCase();
  if (conn.hasSession(room || undefined)) conn.resume();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <StoreContext.Provider value={store}>
        <App />
      </StoreContext.Provider>
    </StrictMode>,
  );
}

void boot();
