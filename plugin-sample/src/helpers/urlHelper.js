export const buildUrl = (...uris) => {
  const baseUrl = (process.env.REACT_SERVICE_BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('[urlHelper] REACT_SERVICE_BASE_URL is not set — check your .env file');
  }
  const pathParts = uris.map((s) => s.replace(/^\/+/, '').replace(/\/+$/, ''));
  return [baseUrl, ...pathParts].filter(Boolean).join('/');
};
