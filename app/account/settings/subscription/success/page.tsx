'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type StatusResponse = {
  session?: {
    id: string;
    client_reference_id?: string | null;
    customer?: string | null;
    metadata?: Record<string, any>;
  };
  stripeSubscription?: {
    id: string;
    status: string;
    price_id?: string | null;
    current_period_start?: number | null;
    current_period_end?: number | null;
  } | null;
  dbSubscription?: any | null;
  error?: string;
};

function useSubscriptionStatus(sessionId: string | null) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sessionId);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus(null);
      setLoading(false);
      return;
    }

    let canceled = false;
    const fetchStatus = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/subscriptions/status?session_id=${encodeURIComponent(sessionId)}`);
        const data: StatusResponse = await res.json();
        if (!canceled) setStatus(data);
      } catch (err) {
        if (!canceled) setStatus({ error: (err as any)?.message ?? 'Fetch error' });
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    fetchStatus();

    // If dbSubscription missing, poll a few times (webhook may be slightly delayed)
    const interval = setInterval(async () => {
      setAttempts((a) => a + 1);
      if (attempts >= 6) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(`/api/subscriptions/status?session_id=${encodeURIComponent(sessionId)}`);
        const data: StatusResponse = await res.json();
        if (!canceled) setStatus(data);
        // stop polling if dbSubscription exists or stripeSubscription is active
        if ((data.dbSubscription) || (data.stripeSubscription && data.stripeSubscription.status === 'active')) {
          clearInterval(interval);
        }
      } catch (e) {
        // ignore and retry
      }
    }, 3000);

    return () => {
      canceled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, attempts]);

  return { status, loading, refresh: () => {/* trigger fetch by toggling attempts */ setAttempts(0)} };
}

function SuccessContent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Next.js client component: read search params only on client after mount
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const session_id = searchParams.get('session_id');
    setSessionId(session_id);
  }, [searchParams, mounted]);

  const { status, loading } = useSubscriptionStatus(sessionId);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow px-6 py-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
              <svg className="h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Anchored Family!</h1>

            <p className="text-lg text-gray-600 mb-6">Thank you for subscribing! Your payment has been processed successfully.</p>

            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6 text-left">
              {sessionId ? (
                <>
                  <h3 className="text-sm font-medium text-green-800">Subscription Status</h3>
                  {loading && <p className="mt-1 text-sm text-green-700">Checking subscription status…</p>}

                  {!loading && status?.error && (
                    <p className="mt-1 text-sm text-red-700">Error: {status.error}</p>
                  )}

                  {!loading && !status?.error && (
                    <>
                      <div className="mt-2 text-sm text-gray-800">
                        <p><strong>Session ID:</strong> {status?.session?.id ?? sessionId}</p>
                        <p><strong>Stripe subscription:</strong> {status?.stripeSubscription ? `${status.stripeSubscription.id} (${status.stripeSubscription.status})` : 'Not yet available'}</p>
                        <p><strong>Stored in DB:</strong> {status?.dbSubscription ? 'Yes' : 'No'}</p>
                        {status?.stripeSubscription?.price_id && <p><strong>Price ID:</strong> {status.stripeSubscription.price_id}</p>}
                      </div>
                      <div className="mt-3">
                        <Link href="/account/settings/subscription" className="text-sm text-blue-600 hover:underline">Go to Subscription Settings</Link>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-green-700">No session id found in URL.</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Link href="/home" className="inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                  Go to Dashboard
                </Link>
                <Link href="/account/settings/subscription" className="inline-flex justify-center items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                  Manage Subscription
                </Link>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense fallback={
      <div className="container">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
