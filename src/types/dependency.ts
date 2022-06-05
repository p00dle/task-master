export interface Dependency<T extends { release: () => any; wasReleased: boolean }> {
  requestResource: () => Promise<T>;
}
