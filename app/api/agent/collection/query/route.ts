import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { answerCollectionQuery } from "@/lib/agent/query";
const Input = z.object({ question: z.string().min(3).max(500) });
export async function POST(request: Request) { try { const context = getRequestContext(request); const input = Input.parse(await request.json()); return NextResponse.json(answerCollectionQuery(repository, context.companyId, input.question)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Query failed" }, { status: 400 }); } }
