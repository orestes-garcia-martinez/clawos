export interface ReplayStore {
  has(jti: string): Promise<boolean>
  put(jti: string, exp: number): Promise<void>
}

export class InMemoryReplayStore implements ReplayStore {
  private readonly entries = new Map<string, number>()

  private purgeExpired(now: number): void {
    for (const [key, exp] of this.entries.entries()) {
      if (exp <= now) {
        this.entries.delete(key)
      }
    }
  }

  async has(jti: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000)
    this.purgeExpired(now)
    return this.entries.has(jti)
  }

  async put(jti: string, exp: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    this.purgeExpired(now)
    this.entries.set(jti, exp)
  }
}
