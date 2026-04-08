import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputPath = path.join(projectRoot, 'src', 'assets', 'app-config.js');

const envFilePaths = [
  path.join(workspaceRoot, '.env'),
  path.join(projectRoot, '.env'),
];

const envFromFiles = Object.assign(
  {},
  ...(await Promise.all(envFilePaths.map(loadEnvFile))).filter(Boolean),
);
const resolvedEnv = {
  ...envFromFiles,
  ...process.env,
};
const derivedBackendOrigin = resolveBackendOrigin(resolvedEnv);

const apiBaseUrl =
  pickEnvValue(resolvedEnv, [
    'FRONTEND_API_BASE_URL',
    'API_BASE_URL',
    'FRONTEND_APP_API_BASE_URL',
    'APP_API_BASE_URL',
  ]) ?? buildApiBaseUrl(derivedBackendOrigin) ?? 'http://localhost:3002/api/v1';
const wsBaseUrl =
  pickEnvValue(resolvedEnv, [
    'FRONTEND_WS_BASE_URL',
    'WS_BASE_URL',
    'FRONTEND_APP_WS_BASE_URL',
    'APP_WS_BASE_URL',
  ]) ?? derivedBackendOrigin ?? 'http://localhost:3002';
const clientLoggingEnabled =
  (pickEnvValue(resolvedEnv, [
    'FRONTEND_CLIENT_LOGGING_ENABLED',
    'CLIENT_LOGGING_ENABLED',
    'FRONTEND_APP_CLIENT_LOGGING_ENABLED',
    'APP_CLIENT_LOGGING_ENABLED',
  ]) ?? 'true') === 'true';

const contents = `window.__APP_CONFIG__ = ${JSON.stringify(
  {
    apiBaseUrl,
    wsBaseUrl,
    clientLoggingEnabled,
  },
  null,
  2,
)};\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, contents, 'utf8');

console.log(`Runtime config generated at ${outputPath}`);

async function loadEnvFile(filePath) {
  try {
    const contents = await readFile(filePath, 'utf8');
    return parseEnvFile(contents);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function parseEnvFile(contents) {
  return contents.split(/\r?\n/).reduce((accumulator, rawLine) => {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      return accumulator;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      return accumulator;
    }

    accumulator[key] = stripWrappingQuotes(value);
    return accumulator;
  }, {});
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function pickEnvValue(source, keys) {
  for (const key of keys) {
    const value = source[key];

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return null;
}

function resolveBackendOrigin(source) {
  const backendUrl =
    pickEnvValue(source, [
      'BACKEND_EXTERNAL_URL',
      'BACKEND_URL',
      'RENDER_BACKEND_EXTERNAL_URL',
    ]) ??
    pickEnvValue(source, [
      'BACKEND_EXTERNAL_HOSTNAME',
      'BACKEND_HOSTNAME',
      'RENDER_BACKEND_EXTERNAL_HOSTNAME',
    ]);

  if (!backendUrl) {
    return null;
  }

  return normalizeOrigin(backendUrl);
}

function normalizeOrigin(value) {
  const trimmedValue = String(value).trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue =
    trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')
      ? trimmedValue
      : `https://${trimmedValue}`;

  try {
    return new URL(normalizedValue).origin;
  } catch {
    return null;
  }
}

function buildApiBaseUrl(origin) {
  if (!origin) {
    return null;
  }

  return `${origin.replace(/\/+$/, '')}/api/v1`;
}
