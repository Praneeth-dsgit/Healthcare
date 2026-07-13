import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, UserPlus, AlertCircle } from 'lucide-react';
import UsageStatisticsModal from './UsageStatisticsModal';
import { roleService } from '../services/roleService';
import { setTokens, getAuthHeaders, clearAuth } from '../services/authService';
import { getApiBaseUrl } from '../utils/apiBase';

const API_BASE = getApiBaseUrl();

interface LoginProps {
  onLoginSuccess: () => void;
  onNavigateToSignup?: () => void;
  redirectPath?: string; // Optional redirect path after successful login
  capabilityName?: string; // Optional capability name for display (used by parent AuthLayout)
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onNavigateToSignup, redirectPath, capabilityName }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showUserNotFoundDialog, setShowUserNotFoundDialog] = useState(false);
  const [userNotFoundEmail, setUserNotFoundEmail] = useState('');
  const [showUsageStats, setShowUsageStats] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session') === 'expired') {
      setMessage('Your session expired. Please sign in again.');
      setMessageType('error');
    }
  }, []);

  // Note: Removed auto-redirect for already authenticated users
  // Users can always access the login page to switch accounts or re-authenticate

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType('');
    setShowUserNotFoundDialog(false);
    
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      // Parse JSON response - handle both success and error responses
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        // If JSON parsing fails, create a basic error object
        console.error('Failed to parse response:', jsonErr);
        setMessage('Server error. Please try again.');
        setMessageType('error');
        setLoading(false);
        return;
      }
      
      if (res.ok) {
        setMessage('Login successful! Redirecting...');
        setMessageType('success');
        const accessToken = data.accessToken;
        const refreshToken = data.refreshToken;
        if (!accessToken || !refreshToken) {
          setMessage('Invalid login response. Please try again.');
          setMessageType('error');
          setLoading(false);
          return;
        }
        clearAuth();
        roleService.clearCache();
        setTokens(accessToken, refreshToken, email, data.patient_id ?? null);

        roleService.getDefaultRoute().then((defaultRoute) => {
          const returnTo = new URLSearchParams(window.location.search).get('returnTo');
          if (returnTo && returnTo.startsWith('/')) {
            setTimeout(() => {
              window.location.href = returnTo;
            }, 500);
          } else if (redirectPath) {
            setTimeout(() => {
              window.location.href = redirectPath;
            }, 500);
          } else {
            setTimeout(() => {
              if (defaultRoute !== '/login') {
                window.location.href = defaultRoute;
              } else {
                onLoginSuccess();
              }
            }, 500);
          }
        }).catch(() => {
          if (redirectPath) {
            setTimeout(() => window.location.href = redirectPath, 500);
          } else {
            onLoginSuccess();
          }
        });
      } else if (res.status === 404 && data.user_not_found) {
        // User not found - show signup dialog
        setUserNotFoundEmail(email);
        setShowUserNotFoundDialog(true);
        setMessage('');
      } else {
        setMessage(data.error || 'Login failed.');
        setMessageType('error');
      }
    } catch (err) {
      console.error('Login error:', err);
      setMessage('Login failed. Please check your connection and try again.');
      setMessageType('error');
    }
    setLoading(false);
  };

  const handleNavigateToSignup = () => {
    setShowUserNotFoundDialog(false);
    if (onNavigateToSignup) {
      onNavigateToSignup();
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="healthcare-input w-full"
            required
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              onChange={e => setPassword(e.target.value)}
              value={password}
              className="healthcare-input w-full pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        
        <button 
          type="submit" 
          className="healthcare-button w-full font-medium py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </button>
        
        {/* Sign Up Navigation */}
        <div className="text-center pt-2">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={onNavigateToSignup}
              className="text-blue-600 hover:text-blue-700 font-medium underline"
            >
              Sign Up
            </button>
          </p>
        </div>
        
        {message && (
          <div
            role="alert"
            className={`mt-3 rounded-md border p-3 ${
              messageType === 'success'
                ? 'border-emerald-500/45 bg-emerald-500/15'
                : 'border-red-500/45 bg-red-500/15'
            }`}
          >
            <p
              className={`text-sm font-medium ${
                messageType === 'success' ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {message}
            </p>
          </div>
        )}
      </form>

      {/* User Not Found Dialog */}
      {showUserNotFoundDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="modal-surface w-full max-w-md p-6 animate-fade-in-up"
            role="dialog"
            aria-labelledby="account-not-found-title"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
                <AlertCircle className="h-5 w-5 text-amber-300" />
              </div>
              <h3 id="account-not-found-title" className="text-lg font-semibold text-slate-100">
                Account Not Found
              </h3>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm text-slate-400">
                No account found with{' '}
                <strong className="font-medium text-slate-200">{userNotFoundEmail}</strong>.
              </p>

              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                <p className="text-sm text-sky-200">
                  Would you like to create a new account with this email?
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleNavigateToSignup}
                className="healthcare-button flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-medium"
              >
                <UserPlus className="h-4 w-4" />
                Create New Account
              </button>

              <button
                type="button"
                onClick={() => setShowUserNotFoundDialog(false)}
                className="ghost-button w-full rounded-lg py-2.5 font-semibold"
              >
                Try Different Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Statistics Modal */}
      <UsageStatisticsModal
        isOpen={showUsageStats}
        onClose={() => setShowUsageStats(false)}
        userEmail={email}
      />
    </>
  );
};

export default Login; 