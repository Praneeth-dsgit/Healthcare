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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <UserCheck className="h-6 w-6 text-blue-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Account Already Exists</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-2">
                An account with <strong>{existingEmailInfo.email}</strong> already exists.
              </p>
              
              {existingEmailInfo.isVerified ? (
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <p className="text-sm text-green-700">
                    ✓ This account is verified and ready to use.
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <p className="text-sm text-yellow-700">
                    ⚠ This account exists but hasn't been verified yet.
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={handleNavigateToLogin}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Go to Login
              </button>
              
              <button
                onClick={() => setShowEmailExistsDialog(false)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors"
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