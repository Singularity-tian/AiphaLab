export interface TokenBucket {
  tryAcquire(): boolean;
  waitForToken(): Promise<void>;
  tokensPerMinute: number;
}

export function createTokenBucket(tokensPerMinute: number): TokenBucket {
  let tokens = tokensPerMinute;
  const refillInterval = (60 * 1000) / tokensPerMinute; // ms between each token refill
  let lastRefill = Date.now();

  function refill() {
    const now = Date.now();
    const elapsed = now - lastRefill;
    const newTokens = Math.floor(elapsed / refillInterval);
    if (newTokens > 0) {
      tokens = Math.min(tokensPerMinute, tokens + newTokens);
      lastRefill = now - (elapsed % refillInterval);
    }
  }

  return {
    tokensPerMinute,

    tryAcquire(): boolean {
      refill();
      if (tokens > 0) {
        tokens--;
        return true;
      }
      return false;
    },

    async waitForToken(): Promise<void> {
      while (true) {
        refill();
        if (tokens > 0) {
          tokens--;
          return;
        }
        // Wait until next token refills
        const waitMs = Math.max(refillInterval - (Date.now() - lastRefill), 10);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    },
  };
}

// Global shared buckets — created once, used across all daemon phases
export const fmpBucket = createTokenBucket(280);  // FMP Starter: 300/min, 20 buffer
export const llmBucket = createTokenBucket(40);   // Anthropic tier (adjustable)
