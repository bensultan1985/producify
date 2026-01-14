import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs"; // keep it simple for now

const ReqSchema = z.object({
  midiBase64: z.string().min(10),
  bpm: z.number().int().min(40).max(240),
});

// We ask the model to return ONLY this JSON.
const ArrangedStep = z.object({
  midi: z.number().int().min(0).max(127),
  vel: z.number().min(0).max(1).optional(),
  durSteps: z.number().int().min(1).max(8).optional(),
});

const ResSchema = z.object({
  tracks: z.object({
    strings2: z.array(ArrangedStep.nullable()).length(8),
    strings3: z.array(ArrangedStep.nullable()).length(8),
    toms: z.array(z.union([z.literal(0), z.literal(1)])).length(8),
    sax: z.array(ArrangedStep.nullable()).length(8),
  }),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  console.log("Received arrangement request");
  const apiKey = process.env.OPENAI_API_KEY;
  const body = await req.json();
  const parsed = ReqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { midiBase64, bpm } = parsed.data;

  // --- Call OpenAI
  // You can swap to the official OpenAI SDK if you prefer. This is a minimal fetch example.
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  const system = `
You are a music arranger. You will receive a base64 MIDI file representing an 8-step loop (8th-note grid).
Create tasteful background orchestration ONLY for these four tracks:
- strings2 (supporting harmonies/pads)
- strings3 (counterline or low support)
- toms (drum fills; sparse)
- sax (simple motif or call/response; sparse)

Constraints:
- Return STRICT JSON only (no markdown, no commentary).
- Each track must be an array of length 8.
- For pitched steps: use { "midi": number, "vel"?: 0..1, "durSteps"?: 1..8 } or null.
- For toms: 0 or 1 per step.
- Keep parts musically supportive, not overpowering.
`;

  const user = `
BPM: ${bpm}
MIDI (base64): ${midiBase64}

Return JSON in this exact shape:
{
  "tracks": {
    "strings2": [ ...8 items... ],
    "strings3": [ ...8 items... ],
    "toms": [ ...8 items... ],
    "sax": [ ...8 items... ]
  },
  "notes": "optional short note to user"
}
`;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Use a currently supported model and the proper
      // Responses API fields (instructions + input).
      model: "gpt-4.1-mini",
      instructions: system,
      input: user,
      // Strongly encourage valid JSON output only.
      text: { format: { type: "json_object" } },
    }),
  });
  console.log("OpenAI response status: " + resp.status);
  console.log(
    "OpenAI response headers: " +
      JSON.stringify(Object.fromEntries(resp.headers as any))
  );
  console.log("status text: " + resp.statusText);

  if (!resp.ok) {
    const errText = await resp.text();
    return NextResponse.json(
      { error: "Model call failed", details: errText },
      { status: 502 }
    );
  }

  const data = await resp.json();

  // The Responses API typically returns generated text in output[]; easiest is:
  const outputText =
    data?.output?.[0]?.content?.find((c: any) => c.type === "output_text")
      ?.text ??
    data?.output_text ??
    null;

  if (!outputText) {
    return NextResponse.json(
      { error: "No output text from model" },
      { status: 502 }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(outputText);
  } catch {
    return NextResponse.json(
      { error: "Model output was not valid JSON", raw: outputText },
      { status: 502 }
    );
  }

  const arranged = ResSchema.safeParse(json);
  if (!arranged.success) {
    return NextResponse.json(
      {
        error: "Model JSON did not match schema",
        details: arranged.error.flatten(),
        raw: json,
      },
      { status: 502 }
    );
  }

  return NextResponse.json(arranged.data);
}
