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

async function proxyRequest(request: NextRequest, path: string[]) {
  try {
    const targetUrl = buildTargetUrl(request, path);

    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete('host');
    forwardedHeaders.delete('content-length');

    const init: RequestInit = {
      method: request.method,
      headers: forwardedHeaders,
      cache: 'no-store'
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = await request.arrayBuffer();
    }

    const response = await fetch(targetUrl, init);
    const responseBody = await response.arrayBuffer();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: response.headers
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
