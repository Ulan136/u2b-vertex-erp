import { NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Public URL where external clients submit field-service requests.
// The external cabinet page will be built later; this just makes the endpoint ready.
export function GET() {
  const base = process.env.EXTERNAL_CABINET_URL || 'https://u2b-vertex-erp.vercel.app/cabinet';
  return NextResponse.json({ url: base }, { headers: CORS_HEADERS });
}
