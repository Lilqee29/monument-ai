/**
 * Token Cache for Clerk Authentication.
 * Uses an in-memory map to avoid iOS Keychain (SecureStore) entitlement crashes
 * on sideloaded (free Apple ID) builds.
 */

const memoryCache = new Map<string, string>();

export const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return memoryCache.get(key) ?? null;
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      memoryCache.set(key, value);
    } catch {
      // ignore
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      memoryCache.delete(key);
    } catch {
      // ignore
    }
  },
};
