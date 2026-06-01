import React, { useState } from 'react';
import { UserCheck, LogIn, Eye, EyeOff } from 'lucide-react';
import { getApiBaseUrl } from '../utils/apiBase';

interface SignupProps {
  onSignupSuccess: (email: string) => void;
  onNavigateToLogin?: () => void;
}

const Signup: React.FC<SignupProps> = ({ onSignupSuccess, onNavigateToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailExistsDialog, setShowEmailExistsDialog] = useState(false);
  const [existingEmailInfo, setExistingEmailInfo] = useState<{
    email: string;
    isVerified: boolean;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setShowEmailExistsDialog(false);
    
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      
      if (res.ok) {
        // Store patient_id if provided
        if (data.patient_id) {
          sessionStorage.setItem('patient_id', data.patient_id);
          setMessage(`Signup successful! Your patient profile has been created with Patient ID: ${data.patient_id}. You can now login.`);
        } else {
          setMessage('Signup successful! You can now login.');
        }
        // Redirect to login after successful signup
        setTimeout(() => {
          onSignupSuccess(email);
        }, 2000); // Increased timeout to show patient ID message
      } else if (res.status === 409 && data.email_exists) {
        // Email already exists - show dialog with login option
        setExistingEmailInfo({
          email: email,
          isVerified: data.is_verified
        });
        setShowEmailExistsDialog(true);
        setMessage('');
      } else {
        setMessage(data.error || 'Signup failed.');
      }
    } catch (err) {
      setMessage('Signup failed.');
    }
    setLoading(false);
  };

  const handleNavigateToLogin = () => {
    setShowEmailExistsDialog(false);
    if (onNavigateToLogin) {
      onNavigateToLogin();
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              placeholder="Create a secure password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
        
        {/* Login Navigation */}
        <div className="text-center pt-2">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onNavigateToLogin}
              className="text-blue-600 hover:text-blue-700 font-medium underline"
            >
              Sign In
            </button>
          </p>
        </div>
        
        {message && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{message}</p>
          </div>
        )}
      </form>

      {/* Email Already Exists Dialog */}
      {showEmailExistsDialog && existingEmailInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="modal-surface w-full max-w-md p-6 animate-fade-in-up"
            role="dialog"
            aria-labelledby="account-exists-title"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 ring-1 ring-sky-500/30">
                <UserCheck className="h-5 w-5 text-sky-300" />
              </div>
              <h3 id="account-exists-title" className="text-lg font-semibold text-slate-100">
                Account Already Exists
              </h3>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm text-slate-400">
                An account with{' '}
                <strong className="font-medium text-slate-200">{existingEmailInfo.email}</strong>{' '}
                already exists.
              </p>

              {existingEmailInfo.isVerified ? (
                <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3">
                  <p className="text-sm text-emerald-300">
                    This account is verified and ready to use.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3">
                  <p className="text-sm text-amber-200">
                    This account exists but has not been verified yet.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleNavigateToLogin}
                className="healthcare-button flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-medium"
              >
                <LogIn className="h-4 w-4" />
                Go to Login
              </button>

              <button
                type="button"
                onClick={() => setShowEmailExistsDialog(false)}
                className="ghost-button w-full rounded-lg py-2.5 font-semibold"
              >
                Try Different Email
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Signup; 