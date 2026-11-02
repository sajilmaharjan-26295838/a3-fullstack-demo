import { useState } from 'react';
import './App.css';

type Role = 'admin' | 'editor' | 'viewer';
type Me = { username: string; role: Role; permissions: string[] };
type Project = { id: number; name: string; owner: string };

const API = import.meta.env.VITE_API_URL ?? '/api';

async function api<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export default function App() {
  // Token is kept in memory only (not localStorage) to reduce XSS token theft risk.
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');

  async function onLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const { token } = await api<{ token: string }>('/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      setToken(token);
      setMe(await api<Me>('/me', token));
      setProjects(await api<Project[]>('/projects', token));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addProject() {
    setError('');
    try {
      const p = await api<Project>('/projects', token, { method: 'POST', body: JSON.stringify({ name: newName }) });
      setProjects((ps) => [...ps, p]);
      setNewName('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!me) {
    return (
      <main className="card">
        <h1>Project Portal</h1>
        <p>Demo of authentication and role-based access control.</p>
        <form onSubmit={onLogin}>
          <label>
            Username
            <select name="username">
              <option value="alice">alice (admin)</option>
              <option value="bob">bob (editor)</option>
              <option value="carol">carol (viewer)</option>
            </select>
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button type="submit">Log in</button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const can = (perm: string) => me.permissions.includes(perm);

  return (
    <main className="card">
      <header>
        <h1>Project Portal</h1>
        <span>
          {me.username} · <strong>{me.role}</strong>{' '}
          <button onClick={() => { setToken(null); setMe(null); setProjects([]); }}>Log out</button>
        </span>
      </header>

      <h2>Projects</h2>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>{p.name} <small>({p.owner})</small></li>
        ))}
      </ul>

      {can('projects:write') ? (
        <div className="row">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New project name" />
          <button onClick={addProject}>Add</button>
        </div>
      ) : (
        <p className="muted">Your role is read-only.</p>
      )}

      {/* The UI hides controls, but the API enforces the real check (403). */}
      {error && <p className="error">{error}</p>}
      <p className="muted">Permissions: {me.permissions.join(', ')}</p>
    </main>
  );
}
