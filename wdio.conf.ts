declare global {
  namespace WebdriverIO {
    interface Capabilities {
      'tauri:options'?: {
        application: string;
        webviewOptions?: { additionalBrowserArguments: string[] };
      };
    }
  }
}

const applicationPath = process.env.PRISMPAD_E2E_APP;
if (!applicationPath) {
  throw new Error('PRISMPAD_E2E_APP must point to the release-profile PrismPad executable.');
}

/**
 * tauri-driver is deliberately started outside WDIO. The exact release-profile
 * application is passed in the Tauri WebDriver capability. This avoids a browser
 * stand-in and makes every spec exercise the actual Tauri webview.
 */
export const config: WebdriverIO.Config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: Number(process.env.TAURI_DRIVER_PORT ?? 4444),
  path: '/',
  specs: ['./e2e/startup.e2e.ts', './e2e/file-workflow.e2e.ts'],
  maxInstances: 1,
  capabilities: [{
    'tauri:options': {
      application: applicationPath,
      webviewOptions: { additionalBrowserArguments: ['remote-debugging-port=0'] }
    }
  }],
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
