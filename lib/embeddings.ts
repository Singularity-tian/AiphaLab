// Embedding client for pgvector episodic memory.
// Uses OpenAI text-embedding-3-small (1536 dims) if OPENAI_API_KEY is set.
// Falls back to zero vectors (graceful degradation) when key is absent.

const EMBEDDING_DIM = 1536;
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_EMBED_MODEL = "text-embedding-3-small";

export class EmbeddingClient {
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      return new Array(EMBEDDING_DIM).fill(0);
    }

    const response = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: text }),
    });

    if (!response.ok) {
      let detail = "";
      try { const body = await response.json(); detail = (body as any).error?.message ?? JSON.stringify(body); } catch { detail = await response.text().catch(() => ""); }
      console.error(`[embeddings] API error ${response.status}: ${detail}`);
      return new Array(EMBEDDING_DIM).fill(0);
    }

    const data = (await response.json()) as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey || texts.length === 0) {
      return texts.map(() => new Array(EMBEDDING_DIM).fill(0));
    }

    const response = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: texts }),
    });

    if (!response.ok) {
      let detail = "";
      try { const body = await response.json(); detail = (body as any).error?.message ?? JSON.stringify(body); } catch { detail = await response.text().catch(() => ""); }
      console.error(`[embeddings] Batch API error ${response.status}: ${detail}`);
      return texts.map(() => new Array(EMBEDDING_DIM).fill(0));
    }

    const data = (await response.json()) as { data: { index: number; embedding: number[] }[] };
    const result = new Array(texts.length).fill(null);
    for (const item of data.data) {
      result[item.index] = item.embedding;
    }
    return result.map((e) => e ?? new Array(EMBEDDING_DIM).fill(0));
  }
}

let _embedClient: EmbeddingClient | null = null;
export function getEmbeddingClient(): EmbeddingClient {
  if (!_embedClient) _embedClient = new EmbeddingClient();
  return _embedClient;
}
