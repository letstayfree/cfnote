// Catch-all: serve SPA for non-API routes
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  // Let API routes pass through
  if (url.pathname.startsWith('/api/')) {
    return context.next()
  }
  // Serve index.html for SPA routing
  return context.next()
}
