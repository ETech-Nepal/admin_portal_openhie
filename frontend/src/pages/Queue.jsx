import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const STATUSES = ['OPEN', 'MERGE_PARTIAL', 'MERGED', 'DISMISSED', 'ALL'];

const name = (d) => [d?.givenName, d?.familyName].filter(Boolean).join(' ') || '(no name)';
const fmtDob = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d || '—');

export default function Queue({ onOpen, onError, onSignOut }) {
  const [status, setStatus] = useState('OPEN');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async (s) => {
    setLoading(true);
    try {
      setData(await api.listTasks(s));
    } catch (err) {
      if (err.status === 401) return onSignOut();
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onError, onSignOut]);

  useEffect(() => { load(status); }, [status, load]);

  async function scan() {
    setScanning(true);
    try {
      const stats = await api.scan();
      await load(status);
      onError(`Scan complete — ${stats.scanned} records, ${stats.queued} pair(s) queued.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setScanning(false);
    }
  }

  const counts = data?.counts ?? {};

  return (
    <section>
      <div className="toolbar">
        <div className="tabs">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`tab ${status === s ? 'on' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s.replace('_', ' ')}
              {counts[s] != null && <span className="count">{counts[s]}</span>}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={scan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Scan for duplicates'}
        </button>
      </div>

      {counts.MERGE_PARTIAL > 0 && status !== 'MERGE_PARTIAL' && (
        <div className="banner warn">
          {counts.MERGE_PARTIAL} merge(s) finished in JeMPI but did not complete in the FHIR record.
          Those patients are inconsistent until retried.
        </div>
      )}

      {loading && <p className="muted">Loading…</p>}

      {!loading && data?.tasks?.length === 0 && (
        <div className="empty">
          <p>Nothing to review.</p>
          <p className="muted">Run a scan to look for duplicate patients.</p>
        </div>
      )}

      <div className="list">
        {(data?.tasks ?? []).map((t) => {
          const a = t.detail?.a, b = t.detail?.b;
          const disagree = (t.detail?.fields ?? []).filter((f) => f.compared && !f.agree).map((f) => f.label);
          return (
            <button key={t.id} className="row" onClick={() => onOpen(t.id)}>
              <div className={`score band-${t.band}`}>
                <strong>{(t.score * 100).toFixed(0)}%</strong>
                <span>{t.band}</span>
              </div>
              <div className="row-main">
                <div className="row-title">{name(a?.demographics)} &nbsp;·&nbsp; {name(b?.demographics)}</div>
                <div className="row-meta">
                  <span>dob {fmtDob(a?.demographics?.dob)}</span>
                  <span>Health IDs {a?.healthId ?? '—'} / {b?.healthId ?? '—'}</span>
                  {disagree.length > 0 && <span className="warn-text">differs on {disagree.join(', ')}</span>}
                </div>
              </div>
              <div className={`pill s-${t.status}`}>{t.status.replace('_', ' ')}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
