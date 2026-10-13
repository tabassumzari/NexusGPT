// ONE place to manage the models users can pick.
// A model only shows up in the dropdown if its provider's API key is set in .env.
// vision: true  = the model can look at image attachments.
//
// To add a model: add a line here. To add a new provider: create providers/<name>.js
// (see providers/openai.js) and register it in providers/index.js.
export const MODELS = [
    { id: "gpt-4o-mini",       label: "GPT-4o mini",       desc: "Fast & affordable", provider: "openai",    vision: true },
    { id: "gpt-4o",            label: "GPT-4o",            desc: "Most capable",      provider: "openai",    vision: true },
    { id: "gpt-4.1-mini",      label: "GPT-4.1 mini",      desc: "Balanced",          provider: "openai",    vision: true },
    { id: "claude-haiku-5-5",  label: "Claude Haiku 5.5",  desc: "Fast",              provider: "anthropic", vision: true },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", desc: "Balanced",          provider: "anthropic", vision: true }
];
