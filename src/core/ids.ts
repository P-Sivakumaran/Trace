/** Identifier rule shared with the Electron main process (getProjectDir). */
export const ID_PATTERN = /^[a-zA-Z0-9_\-.]{1,128}$/;

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id) && id !== '.' && id !== '..';
}
