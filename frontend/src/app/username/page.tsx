'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function UsernamePage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [checking, setChecking] = useState(false);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Debounced check username
  useEffect(() => {
    if (!userName) return;
    const timeout = setTimeout(async () => {
      setChecking(true);
      try {
        const { data } = await axios.get(`/api/profile/username-exists`, {
          params: { username: userName },
        });
        setExists(data.exists);
      } catch {
        // ignore
      } finally {
        setChecking(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [userName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (exists) {
      setError('Username already taken');
      return;
    }
    setSaving(true);
    try {
      await axios.post('/api/profile/username', { userName });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to set username');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center">Choose a username</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value.trim());
                setError('');
              }}
              required
              className="w-full px-3 py-2 mt-1 border rounded-md"
            />
            {checking && <p className="text-sm text-gray-500">Checking...</p>}
            {!checking && userName && exists && (
              <p className="text-sm text-red-500">Username already taken</p>
            )}
          </div>
          {error && <p className="text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || checking || !userName}
            className="w-full px-4 py-2 text-white bg-blue-600 rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

