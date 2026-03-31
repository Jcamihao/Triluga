import { environment } from '../../../environments/environment';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isLocalHost(hostname: string) {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

function getApiBaseUrl() {
  try {
    return new URL(environment.apiBaseUrl);
  } catch {
    return null;
  }
}

export function normalizeNetworkUrl(url: string | null | undefined) {
  if (!url) {
    return url ?? null;
  }

  if (
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('capacitor:') ||
    url.startsWith('file:')
  ) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    const apiBaseUrl = getApiBaseUrl();

    if (!apiBaseUrl) {
      return url;
    }

    if (!isLocalHost(parsedUrl.hostname) || isLocalHost(apiBaseUrl.hostname)) {
      return url;
    }

    parsedUrl.hostname = apiBaseUrl.hostname;
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

export function normalizeApiPayloadUrls<T>(value: T): T {
  if (typeof value === 'string') {
    return normalizeNetworkUrl(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeApiPayloadUrls(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        normalizeApiPayloadUrls(entryValue),
      ]),
    ) as T;
  }

  return value;
}
