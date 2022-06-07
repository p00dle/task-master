export interface DependencyType {
  wasReleased: boolean;
  release: () => Promise<void>;
}

export interface Dependency<T extends DependencyType> {
  defaultTimeoutMs: number;
  requestResource: (timeoutMs: number) => Promise<T>;
}
