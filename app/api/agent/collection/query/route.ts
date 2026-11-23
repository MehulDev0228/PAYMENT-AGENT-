import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { answerCollectionQuery } from "@/lib/agent/query";
const Input = z.object({ question: z.string().min(3).max(500) });
export async function POST(request: Request) { try { const context = await getApiContext(request); const input = Input.parse(await request.json()); return NextResponse.json(await answerCollectionQuery(repository, context, input.question)); } catch (error) { return apiError(error, "Query failed"); } }
