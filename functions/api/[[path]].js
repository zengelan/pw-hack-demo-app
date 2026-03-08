// Cloudflare Pages Function: proxy /api/* to the Worker backend
// The Worker handles all API logic (hashes, spaces, allowlist, etc.)

const WORKER_URL = 'https://pw-hack-demo-app.andreas-zengel.workers.dev';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Build the target URL: proxy to the Worker
  const targetUrl = WORKER_URL + url.pathname + url.search;
  
  // Clone the request to the Worker
  const workerRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow',
  });
  
  // Fetch from Worker and return response
  const response = await fetch(workerRequest);
  
  // Return the response from the Worker
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
