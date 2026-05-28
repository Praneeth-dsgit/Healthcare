import React, { useState } from 'react';
import { getApiBaseUrl } from '../utils/apiBase';

const OtpVerification: React.FC<{ email?: string; onVerified: () => void }> = ({ email: propEmail, onVerified }) => {
  // Get email from props, localStorage, or use empty string
  const storedEmail = localStorage.getItem('pendingVerificationEmail');
  const email = propEmail || storedEmail || '';
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('OTP verified! Account activated.');
        // Store patient_id if provided
        if (data.patient_id) {
          sessionStorage.setItem('patient_id', data.patient_id);
        }
        // Clear pending verification email
        localStorage.removeItem('pendingVerificationEmail');
        // Set authenticated
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('userEmail', email);
        onVerified();
      } else {
        setMessage(data.error || 'OTP verification failed.');
      }
    } catch (err) {
      setMessage('OTP verification failed.');
    }
    setLoading(false);
  };

  const handleResendOtp = async () => {
    if (!email) {
      setMessage('Email not found. Please sign up again.');
      return;
    }
    
    setResending(true);
    setMessage('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('OTP has been resent to your email. Please check your inbox.');
      } else {
        setMessage(data.error || 'Failed to resend OTP. Please try again.');
      }
    } catch (err) {
      setMessage('Failed to resend OTP. Please try again.');
    }
    setResending(false);
  };

  if (!email) {
    return (
      <div className="max-w-sm mx-auto p-4 border rounded bg-yellow-50 border-yellow-200">
        <h2 className="text-xl mb-4 text-yellow-800">Email Not Found</h2>
        <p className="text-yellow-700 mb-4">Please sign up again or contact support.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto p-4 border rounded bg-white shadow-md">
      <h2 className="text-xl mb-2 font-semibold text-gray-900">Verify OTP</h2>
      <p className="text-sm text-gray-600 mb-4">Enter the 6-digit code sent to <strong>{email}</strong></p>
      <input
        type="text"
        placeholder="Enter 6-digit OTP"
        value={otp}
        onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        maxLength={6}
        className="block w-full mb-2 p-3 border border-gray-300 rounded-md text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      <button 
        type="submit" 
        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed" 
        disabled={loading || otp.length !== 6}
      >
        {loading ? 'Verifying...' : 'Verify OTP'}
      </button>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-gray-600">Didn't receive the code?</span>
        <button 
          type="button"
          onClick={handleResendOtp}
          disabled={resending || !email}
          className="text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {resending ? 'Resending...' : 'Resend OTP'}
        </button>
      </div>
      {message && (
        <div className={`mt-3 p-3 rounded-md border ${
          message.includes('resent') || message.includes('verified') || message.includes('success') 
            ? 'bg-green-50 border-green-200 text-green-700' 
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <p className="text-sm text-center">{message}</p>
        </div>
      )}
    </form>
  );
};

export default OtpVerification; 