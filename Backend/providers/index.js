import { MODELS } from "../config/models.js";
import * as openai from "./openai.js";
import * as anthropic from "./anthropic.js";

const PROVIDERS = { openai, anthropic };

/** Models whose provider has an API key configured. */
export const getAvailableModels = () =>
    MODELS.filter((m) => PROVIDERS[m.provider]?.isConfigured());

/** Returns the requested model if it's available, otherwise the first available one (or null). */
export const resolveModel = (id) => {
    const available = getAvailableModels();
    return available.find((m) => m.id === id) ?? available[0] ?? null;
};

/** Stream text chunks from whichever provider owns `model`. */
export const streamCompletion = ({ model, messages, signal }) =>
    PROVIDERS[model.provider].streamCompletion({ model: model.id, messages, signal });
