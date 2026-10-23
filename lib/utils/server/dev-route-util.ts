import { NextResponse } from 'next/server';

// Same { success, data } / { success: false, error } envelope as every other route (see docs/ARCHITECTURE.md).
export const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

// Routes under app/api/dev/ change or inspect the real database with no auth, so they 404 in production.
export const devOnlyGuard = () => (process.env.NODE_ENV === 'production' ? fail('Not available in production', 404) : null);
