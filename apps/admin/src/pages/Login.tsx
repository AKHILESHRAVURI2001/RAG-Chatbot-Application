import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBox, FiLogIn } from 'react-icons/fi';
import { api } from '../lib/api';
import { authStore } from '../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.login(email, password);
      authStore.setToken(token);
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1><FiBox aria-hidden /> MiniChatbotAgent Admin</h1>
        <p className="muted">Sign in with the admin account created via `npm run create-admin`.</p>
        {error && <div className="alert">{error}</div>}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn-primary" type="submit" disabled={loading}>
          <FiLogIn /> {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
