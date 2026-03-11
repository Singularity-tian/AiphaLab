/**
 * mem0 wrapper — uses OSS local backend by default.
 * Each trader agent has a unique userId = "trader_<id>".
 */

// Lazy-load to avoid import errors during build if mem0 isn't fully set up
let _memory: any = null;

async function getMemory() {
  if (!_memory) {
    try {
      const { Memory } = await import("mem0ai/oss");
      _memory = new Memory();
    } catch {
      // Fallback: no-op memory (for environments without mem0)
      _memory = {
        add: async () => {},
        search: async () => [],
      };
    }
  }
  return _memory;
}

export function agentUserId(agentId: number): string {
  return `trader_${agentId}`;
}

/** Store a text memory for an agent. */
export async function addMemory(agentId: number, text: string): Promise<void> {
  try {
    const mem = await getMemory();
    await mem.add(text, { userId: agentUserId(agentId) });
  } catch {
    // Memory failures are non-fatal
  }
}

/** Retrieve relevant memories for an agent given a query. */
export async function searchMemory(
  agentId: number,
  query: string,
  limit = 5
): Promise<string[]> {
  try {
    const mem = await getMemory();
    const results = await mem.search(query, { userId: agentUserId(agentId), limit });
    // mem0 returns [{ memory: string, ... }]
    return (results as any[]).map((r) => r.memory ?? r.text ?? "").filter(Boolean);
  } catch {
    return [];
  }
}
