import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.eventId || !body?.marketType || !body?.selection) {
    return NextResponse.json({ error: "Missing eventId, marketType, selection" }, { status: 400 });
  }

  const pick = await prisma.trackedPick.upsert({
    where: {
      eventId_marketType_selection: {
        eventId: body.eventId,
        marketType: body.marketType,
        selection: body.selection,
      },
    },
    create: {
      eventId: body.eventId,
      marketType: body.marketType,
      selection: body.selection,
    },
    update: {},
  });

  return NextResponse.json({ pick });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.eventId || !body?.marketType || !body?.selection) {
    return NextResponse.json({ error: "Missing eventId, marketType, selection" }, { status: 400 });
  }

  await prisma.trackedPick.delete({
    where: {
      eventId_marketType_selection: {
        eventId: body.eventId,
        marketType: body.marketType,
        selection: body.selection,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
