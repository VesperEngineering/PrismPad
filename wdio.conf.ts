declare global {
  namespace WebdriverIO {
    interface Capabilities {
      'tauri:options'?: {
        application: string;
      };
      'ms:edgeOptions'?: { debuggerAddress: string };
      'wdio:enforceWebDriverClassic'?: boolean;
    }
  }
}

const applicationPath = process.env.PRISMPAD_E2E_APP;
if (!applicationPath) {
  throw new Error('PRISMPAD_E2E_APP must point to the release-profile PrismPad executable.');
}

const debuggerAddress = process.env.PRISMPAD_E2E_DEBUGGER_ADDRESS;
const capabilities: WebdriverIO.Capabilities[] = debuggerAddress
  ? [{
      browserName: 'webview2',
      'ms:edgeOptions': { debuggerAddress },
      'wdio:enforceWebDriverClassic': true
    }]
  : [{
      'tauri:options': { application: applicationPath }
    }];

/**
 * Linux passes the release binary through tauri-driver. Windows launches that
 * same binary first and attaches EdgeDriver to its ready WebView2 endpoint.
 * Windows stays on classic WebDriver so EdgeDriver does not select the BiDi
 * mapper's about:blank target instead of PrismPad's Tauri document.
 * Both paths exercise the actual packaged webview rather than a browser stand-in.
 */
export const config: WebdriverIO.Config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: Number(process.env.TAURI_DRIVER_PORT ?? 4444),
  path: '/',
  specs: ['./e2e/startup.e2e.ts', './e2e/file-workflow.e2e.ts'],
  maxInstances: 1,
  capabilities,
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 2,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000
  }
};
