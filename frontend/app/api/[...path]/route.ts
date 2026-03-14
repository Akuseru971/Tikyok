import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getBackendBaseUrl() {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '';
  return backendUrl.replace(/\/$/, '');
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    throw new Error('BACKEND_URL is not configured on frontend service');
  }

  const query = request.nextUrl.search || '';
  return `${backendBaseUrl}/api/${path.join('/')}${query}`;
}

function getRequestOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (!host) return '';
  return `${proto}://${host}`.replace(/\/$/, '');
}

async function proxyRequest(request: NextRequest, path: string[]) {
  try {
    const targetUrl = buildTargetUrl(request, path);
    const incomingOrigin = getRequestOrigin(request);
    const targetOrigin = new URL(targetUrl).origin.replace(/\/$/, '');

    // Prevent infinite proxy recursion if BACKEND_URL points to the frontend URL.
    if (incomingOrigin && targetOrigin === incomingOrigin) {
      throw new Error('BACKEND_URL points to the frontend host. Set BACKEND_URL to the backend public URL.');
    }

    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete('host');
    forwardedHeaders.delete('content-length');

    const init: RequestInit = {
      method: request.method,
      headers: forwardedHeaders,
      cache: 'no-store'
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      const requestWithDuplex = init as RequestInit & { duplex: 'half' };
      requestWithDuplex.body = request.body;
      requestWithDuplex.duplex = 'half';
    }

    const response = await fetch(targetUrl, init);
    const responseHeaders = new Headers(response.headers);

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'FRONTEND_PROXY_FAILED',
          message: error instanceof Error ? error.message : 'Unable to reach backend service'
        }
      },
      { status: 502 }
    );
  }
}

type RouteContext = { params: { path: string[] } };

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path || []);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path || []);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path || []);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path || []);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path || []);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path || []);
}
