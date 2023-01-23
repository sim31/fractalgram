export function buildQueryString(data: Record<string, string>) {
  const query = Object.keys(data).map((k) => `${k}=${data[k]}`).join('&');
  return query.length > 0 ? `?${query}` : '';
}

export function buildQueryStringNoUndef(data: Record<string, string>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const query = keys.map((k) => `${k}=${data[k]}`).join('&');
  return query.length > 0 ? `?${query}` : '';
}
