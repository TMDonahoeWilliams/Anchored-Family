import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Fallback API route to set an HttpOnly server cookie for the Supabase access token.
 * Accepts:
 *  - OPTIONS: reply to CORS preflight
 *  - POST: { access_token: string, expires_in?: number }
 *
 * Make sure COOKIE_DOMAIN is set if you want the cookie available to .anchoredfamily.com.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // If your client is same-origin you can relax CORS; respond 204 for preflight
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const { access_token, expires_in } = req.body ?? {};
    if (!access_token || typeof access_token !== 'string') {
      return res.status(400).json({ error: 'access_token is required' });
    }

    const cookieDomain = process.env.COOKIE_DOMAIN; // e.g. ".anchoredfamily.com"
    const maxAge = Number(expires_in ?? 60 * 60 * 24 * 14); // seconds, default 14 days

    // Build Set-Cookie header (HttpOnly, Secure, SameSite=Lax)
    const parts = [
      `sb:token=${access_token}`,
      `Path=/`,
      `HttpOnly`,
      `Secure`,
      `SameSite=Lax`,
      `Max-Age=${Math.floor(maxAge)}`,
    ];
    if (cookieDomain) parts.push(`Domain=${cookieDomain}`);

    // Send cookie and JSON response
    res.setHeader('Set-Cookie', parts.join('; '));
    // Also set CORS headers to be safe for preflight/requests from a different origin
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Vary', 'Origin');

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[pages/api/auth/set-server-session] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
