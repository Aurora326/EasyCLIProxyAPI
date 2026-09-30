const alwaysAvailablePages = new Set([
  'overview',
  'home',
  'easy',
  'api',
  'providers',
  'routes',
  'models',
  'model-mapping',
  'playground',
  'logs',
  'traffic',
  'errors',
  'api-keys',
  'oauth',
  'permissions',
  'smart-config',
  'config',
  'versions',
  'usage-records',
  'agents',
]);

export function isAlwaysAvailablePage(pageId: string) {
  return alwaysAvailablePages.has(pageId);
}

export function canOpenAppPage(pageId: string, coreRunning: boolean) {
  return coreRunning || isAlwaysAvailablePage(pageId);
}

