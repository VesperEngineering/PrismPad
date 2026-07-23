import config from '../src-tauri/tauri.conf.json';

it('enforces a local-only content security policy', () => {
  const { csp } = config.app.security;

  expect(csp).not.toBeNull();
  expect(csp).toContain("default-src 'self'");

  const connectSrc = csp?.match(/(?:^|;)\s*connect-src\s+([^;]+)/)?.[1]?.trim();
  expect(connectSrc).toBe('ipc: http://ipc.localhost');
  expect(csp).not.toContain('https:');
  expect(csp).not.toMatch(/(?:^|[\s;])\*(?:$|[\s;])/);
});
