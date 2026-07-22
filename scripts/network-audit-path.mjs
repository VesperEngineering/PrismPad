/** @param {string} value */
export const normalizedPath = (value) => value.replaceAll('\\', '/');

/** @param {string} repositoryPath */
export const isProductionOutputPath = (repositoryPath) =>
  normalizedPath(repositoryPath).startsWith('dist/');
