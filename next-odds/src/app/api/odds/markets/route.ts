import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const rows = await prisma.marketOdds.findMany({
    where: { eventId },
    select: { marketType: true, selection: true },
    distinct: ["marketType", "selection"],
  });

  return NextResponse.json({ markets: rows });
}
