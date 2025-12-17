import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Input, Label } from '../components/shadcn';
import { AlertCircle, Wallet } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-8 rounded-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Wallet className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Finance Tracker</h1>
          <p className="text-foreground-muted text-sm">Sign in to manage your finances</p>
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
