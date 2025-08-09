'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  const handleLogout = () => {
    // This will redirect to the backend, which then redirects to Cognito's logout,
    // and finally back to our new custom login page.
    window.location.href = '/api/logout';
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 text-center bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold">Welcome to Circlify</h1>
        <p>Your journey begins here.</p>
        <div className="flex flex-col space-y-4">
          <Link href="/login" className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700">
              Go to Login
          </Link>
          <Link href="/signup" className="px-4 py-2 text-gray-800 bg-gray-200 rounded-md hover:bg-gray-300">
              Go to Sign Up
          </Link>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
