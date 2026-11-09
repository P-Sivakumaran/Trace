import { BrowserStorageAdapter } from './BrowserStorageAdapter';
import { ElectronStorageAdapter } from './ElectronStorageAdapter';
import { IStorageService } from './IStorageService';

let storageInstance: IStorageService | null = null;

export function getStorageService(): IStorageService {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.isDesktop === true) {
    if (!(storageInstance instanceof ElectronStorageAdapter)) {
      storageInstance = new ElectronStorageAdapter();
    }
    return storageInstance;
  }
  if (!storageInstance) {
    storageInstance = new BrowserStorageAdapter();
  }
  return storageInstance;
}

export * from './IStorageService';
export * from './BrowserStorageAdapter';
export * from './ElectronStorageAdapter';
