/** Small fetch wrapper for the JSON API. Throws Error with server message. */
export async function api(path, { method = 'GET', body, formData } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: formData ? undefined : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}
