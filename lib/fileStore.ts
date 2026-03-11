import fs from "fs/promises";
import path from "path";

export interface TickerBelief {
  thesis: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  lastTrade: {
    side: "BUY" | "SELL";
    date: string;
    price: number;
    outcome: "profit" | "loss" | null;
    pnl: number | null;
  } | null;
  winCount: number;
  lossCount: number;
  notes: string;
  updatedAt: string;
}

export interface AgentFiles {
  identity: string;
  strategy: string;
  beliefs: Record<string, TickerBelief>;
  recentJournals: string[];
}

/** Shared interface implemented by both FileStore (local) and PgFileStore (postgres) */
export interface IFileStore {
  loadIdentity(agentId: number): Promise<string>;
  loadStrategy(agentId: number): Promise<string>;
  loadBeliefs(agentId: number): Promise<Record<string, TickerBelief>>;
  loadRecentJournals(agentId: number, count?: number): Promise<string[]>;
  loadAgentFiles(agentId: number): Promise<AgentFiles>;
  writeIdentity(agentId: number, content: string): Promise<void>;
  writeStrategy(agentId: number, content: string): Promise<void>;
  updateBeliefs(agentId: number, beliefs: Record<string, TickerBelief>): Promise<void>;
  updateTickerBelief(agentId: number, ticker: string, update: Partial<TickerBelief>): Promise<void>;
  writeJournal(agentId: number, date: string, content: string): Promise<void>;
  listJournalDates(agentId: number): Promise<string[]>;
  readJournal(agentId: number, date: string): Promise<string | null>;
  initializeAgentDir(agentId: number, identity: string, strategy: string, beliefs?: Record<string, TickerBelief>): Promise<void>;
  agentExists(agentId: number): Promise<boolean>;
}

export class FileStore implements IFileStore {
  private basePath: string;

  constructor(basePath = "data/agents") {
    this.basePath = basePath;
  }

  private agentDir(agentId: number): string {
    return path.join(
      process.cwd(),
      this.basePath,
      `agent_${String(agentId).padStart(3, "0")}`
    );
  }

  async loadIdentity(agentId: number): Promise<string> {
    return fs.readFile(path.join(this.agentDir(agentId), "identity.md"), "utf8");
  }

  async loadStrategy(agentId: number): Promise<string> {
    return fs.readFile(path.join(this.agentDir(agentId), "strategy.md"), "utf8");
  }

  async loadBeliefs(agentId: number): Promise<Record<string, TickerBelief>> {
    try {
      const raw = await fs.readFile(path.join(this.agentDir(agentId), "beliefs.json"), "utf8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async loadRecentJournals(agentId: number, count = 3): Promise<string[]> {
    const dir = path.join(this.agentDir(agentId), "journal");
    try {
      const files = (await fs.readdir(dir))
        .filter((f) => f.endsWith(".md"))
        .sort()
        .slice(-count);
      return Promise.all(files.map((f) => fs.readFile(path.join(dir, f), "utf8")));
    } catch {
      return [];
    }
  }

  async loadAgentFiles(agentId: number): Promise<AgentFiles> {
    const [identity, strategy, beliefs, recentJournals] = await Promise.all([
      this.loadIdentity(agentId),
      this.loadStrategy(agentId),
      this.loadBeliefs(agentId),
      this.loadRecentJournals(agentId, 3),
    ]);
    return { identity, strategy, beliefs, recentJournals };
  }

  async writeIdentity(agentId: number, content: string): Promise<void> {
    await fs.writeFile(path.join(this.agentDir(agentId), "identity.md"), content, "utf8");
  }

  async writeStrategy(agentId: number, content: string): Promise<void> {
    await fs.writeFile(path.join(this.agentDir(agentId), "strategy.md"), content, "utf8");
  }

  async updateBeliefs(agentId: number, beliefs: Record<string, TickerBelief>): Promise<void> {
    await fs.writeFile(
      path.join(this.agentDir(agentId), "beliefs.json"),
      JSON.stringify(beliefs, null, 2),
      "utf8"
    );
  }

  async updateTickerBelief(
    agentId: number,
    ticker: string,
    update: Partial<TickerBelief>
  ): Promise<void> {
    const beliefs = await this.loadBeliefs(agentId);
    beliefs[ticker] = {
      ...(beliefs[ticker] ?? {
        thesis: "",
        sentiment: "neutral",
        confidence: 0.5,
        lastTrade: null,
        winCount: 0,
        lossCount: 0,
        notes: "",
        updatedAt: new Date().toISOString(),
      }),
      ...update,
      updatedAt: new Date().toISOString(),
    };
    await this.updateBeliefs(agentId, beliefs);
  }

  async writeJournal(agentId: number, date: string, content: string): Promise<void> {
    const journalDir = path.join(this.agentDir(agentId), "journal");
    await fs.mkdir(journalDir, { recursive: true });
    await fs.writeFile(path.join(journalDir, `${date}.md`), content, "utf8");
  }

  async listJournalDates(agentId: number): Promise<string[]> {
    const dir = path.join(this.agentDir(agentId), "journal");
    try {
      const files = await fs.readdir(dir);
      return files
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(".md", ""))
        .sort();
    } catch {
      return [];
    }
  }

  async readJournal(agentId: number, date: string): Promise<string | null> {
    try {
      return await fs.readFile(
        path.join(this.agentDir(agentId), "journal", `${date}.md`),
        "utf8"
      );
    } catch {
      return null;
    }
  }

  async initializeAgentDir(
    agentId: number,
    identity: string,
    strategy: string,
    beliefs: Record<string, TickerBelief> = {}
  ): Promise<void> {
    const dir = this.agentDir(agentId);
    await fs.mkdir(path.join(dir, "journal"), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(dir, "identity.md"), identity, "utf8"),
      fs.writeFile(path.join(dir, "strategy.md"), strategy, "utf8"),
      fs.writeFile(path.join(dir, "beliefs.json"), JSON.stringify(beliefs, null, 2), "utf8"),
    ]);
  }

  async agentExists(agentId: number): Promise<boolean> {
    try {
      await fs.access(path.join(this.agentDir(agentId), "identity.md"));
      return true;
    } catch {
      return false;
    }
  }
}

// ---- PgFileStore: stores docs in agent_docs table (for Vercel+Railway deployment) ----

export class PgFileStore implements IFileStore {
  private db: import("./db/repository").SimDB;

  constructor() {
    // Lazy import to avoid circular deps at module load
    const { SimDB } = require("./db/repository") as typeof import("./db/repository");
    this.db = new SimDB();
  }

  async loadIdentity(agentId: number): Promise<string> {
    const content = await this.db.getAgentDoc(agentId, "identity");
    if (!content) throw new Error(`No identity doc for agent ${agentId}`);
    return content;
  }

  async loadStrategy(agentId: number): Promise<string> {
    const content = await this.db.getAgentDoc(agentId, "strategy");
    if (!content) throw new Error(`No strategy doc for agent ${agentId}`);
    return content;
  }

  async loadBeliefs(agentId: number): Promise<Record<string, TickerBelief>> {
    try {
      const content = await this.db.getAgentDoc(agentId, "beliefs");
      return content ? JSON.parse(content) : {};
    } catch {
      return {};
    }
  }

  async loadRecentJournals(agentId: number, count = 3): Promise<string[]> {
    return this.db.getRecentAgentDocs(agentId, "journal", count);
  }

  async loadAgentFiles(agentId: number): Promise<AgentFiles> {
    const [identity, strategy, beliefs, recentJournals] = await Promise.all([
      this.loadIdentity(agentId),
      this.loadStrategy(agentId),
      this.loadBeliefs(agentId),
      this.loadRecentJournals(agentId, 3),
    ]);
    return { identity, strategy, beliefs, recentJournals };
  }

  async writeIdentity(agentId: number, content: string): Promise<void> {
    await this.db.upsertAgentDoc(agentId, "identity", content);
  }

  async writeStrategy(agentId: number, content: string): Promise<void> {
    await this.db.upsertAgentDoc(agentId, "strategy", content);
  }

  async updateBeliefs(agentId: number, beliefs: Record<string, TickerBelief>): Promise<void> {
    await this.db.upsertAgentDoc(agentId, "beliefs", JSON.stringify(beliefs, null, 2));
  }

  async updateTickerBelief(agentId: number, ticker: string, update: Partial<TickerBelief>): Promise<void> {
    const beliefs = await this.loadBeliefs(agentId);
    beliefs[ticker] = {
      ...(beliefs[ticker] ?? {
        thesis: "",
        sentiment: "neutral",
        confidence: 0.5,
        lastTrade: null,
        winCount: 0,
        lossCount: 0,
        notes: "",
        updatedAt: new Date().toISOString(),
      }),
      ...update,
      updatedAt: new Date().toISOString(),
    };
    await this.updateBeliefs(agentId, beliefs);
  }

  async writeJournal(agentId: number, date: string, content: string): Promise<void> {
    await this.db.upsertAgentDoc(agentId, "journal", content, date);
  }

  async listJournalDates(agentId: number): Promise<string[]> {
    return this.db.listAgentDocDates(agentId, "journal");
  }

  async readJournal(agentId: number, date: string): Promise<string | null> {
    return this.db.getAgentDoc(agentId, "journal", date);
  }

  async initializeAgentDir(
    agentId: number,
    identity: string,
    strategy: string,
    beliefs: Record<string, TickerBelief> = {}
  ): Promise<void> {
    await Promise.all([
      this.writeIdentity(agentId, identity),
      this.writeStrategy(agentId, strategy),
      this.updateBeliefs(agentId, beliefs),
    ]);
  }

  async agentExists(agentId: number): Promise<boolean> {
    const content = await this.db.getAgentDoc(agentId, "identity");
    return content !== null;
  }
}

// ---- Factory: switch between local fs and Postgres based on env ----

let _localStore: FileStore | null = null;
let _pgStore: PgFileStore | null = null;

/** Returns LocalFileStore in dev, PgFileStore when FILESTORE_BACKEND=pg */
export function getFileStore(): IFileStore {
  if (process.env.FILESTORE_BACKEND === "pg") {
    if (!_pgStore) _pgStore = new PgFileStore();
    return _pgStore;
  }
  if (!_localStore) _localStore = new FileStore();
  return _localStore;
}
