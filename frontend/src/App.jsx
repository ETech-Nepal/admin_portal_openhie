import { useEffect, useState, useCallback } from 'react';
import { api, session } from './api.js';
import Login from './pages/Login.jsx';
import Queue from './pages/Queue.jsx';
import ReviewDetail from './pages/ReviewDetail.jsx';

export default function App() {
  const [user, setUser] = useState(() => session.get()?.username ?? null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [toast, setToast] = useState(null);

  const signOut = useCallback(() => {
    session.clear();
    setUser(null);
    setOpenTaskId(null);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!user) return <Login onSignedIn={(u) => setUser(u)} />;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Patient Duplicate Review</h1>
          <p className="sub">Resolve duplicates across JeMPI and the FHIR record</p>
        </div>
        <div className="who">
          <span>{user}</span>
          <button className="link" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}

      <main>
        {openTaskId ? (
          <ReviewDetail
            id={openTaskId}
            onBack={() => setOpenTaskId(null)}
            onResolved={(msg) => { setToast(msg); setOpenTaskId(null); }}
            onError={(m) => setToast({ kind: 'error', message: m })}
          />
        ) : (
          <Queue onOpen={setOpenTaskId} onError={(m) => setToast({ kind: 'error', message: m })} onSignOut={signOut} />
        )}
      </main>
    </div>
  );
}
