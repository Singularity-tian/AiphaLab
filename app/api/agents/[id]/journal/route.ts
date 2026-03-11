import { NextRequest, NextResponse } from "next/server";
import { FileStore } from "@/lib/fileStore";

const fileStore = new FileStore();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agentId = parseInt(id, 10);

  if (isNaN(agentId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  try {
    const dates = await fileStore.listJournalDates(agentId);
    const journals = await Promise.all(
      dates
        .slice(-30) // last 30 entries
        .reverse()  // newest first
        .map(async (date) => ({
          date,
          content: (await fileStore.readJournal(agentId, date)) ?? "",
        }))
    );

    return NextResponse.json(journals);
  } catch (e) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
