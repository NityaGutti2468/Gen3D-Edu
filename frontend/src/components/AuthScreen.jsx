import { useState } from 'react';
import { ArrowRight, Layers3, LoaderCircle, LockKeyhole, Mail, Moon, Sun, UserRound } from 'lucide-react';
import { signIn, signUp } from '../services/api.js';

export default function AuthScreen({ onAuthenticated, apiState, theme, onToggleTheme }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = isSignup ? await signUp(name, email, password) : await signIn(email, password);
      onAuthenticated(result.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" /><button className="theme-toggle auth-theme-toggle" onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span></button>
    <section className="auth-card"><a className="brand auth-brand" href="#"><span className="brand-mark"><Layers3 size={19} /></span><span>gen3d<span className="brand-light">·edu</span></span></a>
      <div className="auth-kicker">YOUR LEARNING STUDIO</div><h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1><p className="auth-sub">Save your generated lessons and return to them whenever you need.</p>
      <form className="auth-form" onSubmit={submit}>
        {isSignup && <label>Your name<span className="auth-input"><UserRound size={16} /><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Name" required maxLength={80} /></span></label>}
        <label>Email address<span className="auth-input"><Mail size={16} /><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" type="email" placeholder="you@example.com" required maxLength={254} /></span></label>
        <label>Password<span className="auth-input"><LockKeyhole size={16} /><input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} type="password" placeholder={isSignup ? 'At least 8 characters' : 'Your password'} required minLength={isSignup ? 8 : 1} maxLength={128} /></span></label>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16} /> Please wait</> : <>{isSignup ? 'Create account' : 'Sign in'} <ArrowRight size={16} /></>}</button>
      </form>
      <div className="auth-switch">{isSignup ? 'Already have an account?' : 'New to Gen3D-Edu?'} <button onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError(''); }}>{isSignup ? 'Sign in' : 'Create an account'}</button></div>
      <div className={`auth-api ${apiState}`}><i />{apiState === 'online' ? 'Secure local workspace' : apiState === 'offline' ? 'API unavailable · start the backend' : 'Connecting to your workspace'}</div>
    </section><div className="auth-caption">LEARN SOMETHING. KEEP IT WITH YOU.</div>
  </main>;
}
