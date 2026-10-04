import "server-only";
import { CANONICAL_FIELDS, CUSTOM, IGNORE, FIELD_BY_KEY, type ColumnMapping } from "@/lib/data-mapping/canonical-schema";
import { dedupeTargets, suggestMappings, type RawRow } from "@/lib/data-mapping/heuristics";
import { AI_FAILED_NOTICE, aiModel, getOpenAI } from "./openai";

export interface MappingSuggestion {
  mappings: ColumnMapping[];
  aiUsed: boolean;
  notice: string | null;
}

/**
 * Suggests column → canonical field mappings. Heuristics always run; when OpenAI is
 * available its suggestions are used, validated against the canonical schema.
 */
export async function suggestColumnMappings(headers: string[], sample: RawRow[]): Promise<MappingSuggestion> {
  const heuristic = suggestMappings(headers, sample);
  const openai = getOpenAI();
  if (!openai) return { mappings: heuristic, aiUsed: false, notice: null };

  const fields = CANONICAL_FIELDS.map((f) => `- ${f.key} (${f.type}): ${f.description}`).join("\n");
  const columns = headers
    .map((h) => {
      const values = sample
        .map((r) => r[h])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
        .slice(0, 6)
        .map((v) => String(v).slice(0, 60));
      return `- "${h}": ${JSON.stringify(values)}`;
    })
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: aiModel(),
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "column_mapping",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["mappings"],
            properties: {
              mappings: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["column", "target", "confidence", "reason"],
                  properties: {
                    column: { type: "string" },
                    target: { type: "string" },
                    confidence: { type: "number" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You map spreadsheet columns from a small business to a canonical business data model. " +
            `For each column choose exactly one target: a field key from the list, "${CUSTOM}" to keep it as a custom field, or "${IGNORE}" for empty/meaningless columns. ` +
            "Use each field key at most once. Confidence is 0..1 and must be honest — lower it when the header is ambiguous. " +
            "Reason is one short sentence. Headers may be in Hebrew or English.\n\nCanonical fields:\n" +
            fields,
        },
        { role: "user", content: `Columns with sample values:\n${columns}` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      mappings?: { column: string; target: string; confidence: number; reason: string }[];
    };
    const byColumn = new Map((parsed.mappings ?? []).map((m) => [m.column, m]));
    const merged: ColumnMapping[] = heuristic.map((h) => {
      const ai = byColumn.get(h.column);
      if (!ai) return h;
      const validTarget = ai.target === CUSTOM || ai.target === IGNORE || FIELD_BY_KEY.has(ai.target);
      if (!validTarget) return h;
      return {
        column: h.column,
        target: ai.target,
        confidence: Math.max(0, Math.min(1, Number(ai.confidence) || 0.5)),
        reason: ai.reason?.slice(0, 200),
        source: "ai",
      };
    });
    return { mappings: dedupeTargets(merged), aiUsed: true, notice: null };
  } catch (error) {
    console.error("[ai] column mapping failed", (error as Error).message);
    return { mappings: heuristic, aiUsed: false, notice: AI_FAILED_NOTICE };
  }
}
