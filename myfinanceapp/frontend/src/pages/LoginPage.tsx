import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Input, Label } from '../components/shadcn';
import { AlertCircle, Wallet, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA state
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const { login, mfaPending, verifyMfa, cancelMfa } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      // If no MFA required, login() will set user and we navigate
      if (!mfaPending) {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    setMfaLoading(true);

    try {
      await verifyMfa(mfaCode);
      navigate('/');
    } catch (err: any) {
      setMfaError(err.message || 'Invalid MFA code');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleCancelMfa = () => {
    cancelMfa();
    setMfaCode('');
    setMfaError('');
  };

  // MFA Verification Form
  if (mfaPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md p-8 rounded-xl border border-border bg-card/50 backdrop-blur-sm shadow-xl">
          <div className="text-center mb-8">
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary opacity-10 blur-2xl rounded-full" />
              <ShieldCheck className="w-10 h-10 text-primary relative z-10" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Two-Factor Authentication</h1>
            <p className="text-foreground-muted">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {mfaError && (
            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-error/10 border border-error/20 text-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{mfaError}</span>
            </div>
          )}

          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfaCode">Authentication Code</Label>
              <Input
                id="mfaCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                placeholder="000000"
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={mfaLoading}
              disabled={mfaCode.length !== 6}
            >
              {mfaLoading ? 'Verifying...' : 'Verify Code'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleCancelMfa}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Standard Login Form
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-8 rounded-xl border border-border bg-card/50 backdrop-blur-sm shadow-xl">
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary opacity-10 blur-2xl rounded-full" />
            <Wallet className="w-10 h-10 text-primary relative z-10" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Finance Tracker</h1>
          <p className="text-foreground-muted">Sign in to manage your finances</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-error/10 border border-error/20 text-error">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              placeholder="Enter your username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
