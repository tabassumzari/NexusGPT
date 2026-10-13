import OpenAI from "openai";

let client;
const getClient = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export const isConfigured = () => Boolean(process.env.OPENAI_API_KEY);

// neutral message -> OpenAI format
const toOpenAI = (m) =>
    typeof m.content === "string"
        ? m
        : {
              role: m.role,
              content: m.content.map((p) =>
                  p.type === "image"
                      ? { type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.data}` } }
                      : { type: "text", text: p.text }
              )
          };

// Every provider exports an async generator that yields text chunks as they arrive.
export async function* streamCompletion({ model, messages, signal }) {
    const stream = await getClient().chat.completions.create(
        { model, messages: messages.map(toOpenAI), stream: true },
        { signal }
    );

    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
    }
}
