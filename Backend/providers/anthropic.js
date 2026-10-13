import Anthropic from "@anthropic-ai/sdk";

let client;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

// neutral message -> Anthropic format
const toAnthropic = (m) =>
    typeof m.content === "string"
        ? m
        : {
              role: m.role,
              content: m.content.map((p) =>
                  p.type === "image"
                      ? { type: "image", source: { type: "base64", media_type: p.mimeType, data: p.data } }
                      : { type: "text", text: p.text }
              )
          };

export async function* streamCompletion({ model, messages, signal }) {
    const stream = getClient().messages.stream(
        { model, max_tokens: 4096, messages: messages.map(toAnthropic) },
        { signal }
    );

    for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield event.delta.text;
        }
    }
}
