import { Dependency } from './types/dependency';

interface MemoryStoreObject<T> {
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  release(): Promise<void>;
  wasReleased: boolean;
}

export class MemoryStore<T extends Record<string, any>> implements Dependency<MemoryStoreObject<T>> {
  defaultTimeoutMs = 10_000;
  protected state: T;
  constructor(initialState?: T) {
    this.state = initialState || ({} as T);
  }
  public async requestResource() {
    return {
      release: async () => undefined,
      get: <K extends keyof T>(key: K) => {
        return this.state[key];
      },
      set: <K extends keyof T>(key: K, value: T[K]) => {
        this.state[key] = value;
      },
      wasReleased: false,
    };
  }
}
