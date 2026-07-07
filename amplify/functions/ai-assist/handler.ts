import Anthropic from '@anthropic-ai/sdk';
import type { Schema } from '../../data/resource';

const client = new Anthropic();

// Adding a new AI-backed tool only requires a new entry here plus a
// matching frontend tool component — no new infrastructure.
const SYSTEM_PROMPTS: Record<string, string> = {
  'task-breakdown': `You help people with ADHD turn big tasks into small, concrete, startable steps.
Given a task, break it into a short ordered checklist of 3-8 steps.
Each step should be small enough to start immediately, described as a physical or concrete action (not "plan" or "think about").
Do not add commentary, encouragement, or headers — respond with the checklist only, one step per line, formatted as "1. ...".`,

  'tone-checker': `You help people with ADHD who worry their written messages (emails, texts, Slack) come across wrong before they send them.
You may also be given optional context about the situation (e.g. who the message is going to, or something relevant going on around it). Use it to inform your read, but stay grounded in the actual words of the message — don't assume more than what's given, and don't speculate about anyone's feelings or intentions beyond the message itself.
Given a message (and optional context), respond in this exact format:
Tone: <one or two words, e.g. "Neutral", "Blunt", "Friendly">
Likely to land as: <one sentence on how a reader would probably perceive it>
Suggestion: <one short concrete rewrite tip, or "None needed" if the message is fine as-is>
Be reassuring and non-judgmental. Do not rewrite the whole message unless asked.`,

  'reply-starter': `You help people with ADHD who are stuck staring at a message they need to reply to and can't get started.
You will be given the message to reply to, a desired tone, a desired length, and optionally a short note on the intent the reply should accomplish.
Write exactly 3 draft replies matching the requested tone and length as closely as possible. If an intent is given, make sure the drafts clearly accomplish it; otherwise cover a few different reasonable angles (e.g. a quick yes, a polite decline or delay, a request for more info) where that fits the message.
Format as a numbered list ("1. ...", "2. ...", "3. ..."), one draft per number. Do not add commentary, headers, or explanations — just the three drafts.`,

  'call-script': `You help neurodivergent people prepare for a phone call that feels awkward, overwhelming, or anxiety-inducing to make — the goal is to hand them the standard social conventions of a call (how to open it, how to close it) so they don't have to improvise those in the moment, alongside the actual thing they need to say.
You will be given what the call needs to accomplish, a desired tone, and optionally who the call is to.
Write a short script in exactly this format, one section per line:
Opening: <a natural greeting, who they are, and why they're calling — 1-2 sentences>
Main point: <the actual message or question, stated plainly and directly — 1-3 sentences>
If they ask more: <one or two brief, ready-to-say responses to the most likely follow-up question or pushback>
Closing: <a natural, brief way to end the call — 1 sentence>
Keep every line something a person would actually say out loud — short sentences, contractions, no jargon or corporate phrasing. Match the requested tone. Do not add commentary, extra sections, or explanations beyond the four listed.`,

  'is-this-mad': `You help people with ADHD or rejection-sensitive dysphoria who receive a message from someone else and immediately spiral into worst-case interpretations of its tone — wondering if the sender is angry, disappointed, or upset with them.
You will be given a message someone else sent, and optionally some context about the situation. Stay grounded in the actual words on the page — don't speculate about the sender's mood, feelings, or hidden intentions beyond what's written. Most messages are far more neutral than they feel in the moment; default to the least alarming reasonable reading unless the words genuinely support a stronger one.
Respond in this exact format:
Tone: <one or two words, e.g. "Neutral", "Busy", "Friendly">
Most likely meaning: <one calm, literal sentence on what they're probably saying — not what they might be feeling>
Reassurance: <one short, grounded reason not to spiral, tied to the actual words, e.g. "Short doesn't mean cold — busy people write short messages">
Be warm but factual. Do not validate a catastrophizing reading even if the context suggests the user is anxious about it — stay grounded in the message itself.`,
};

// Tools whose frontend sends structured JSON (instead of a plain string) as `input`
// register a builder here to turn that JSON into the actual text sent to Claude.
// Tools not listed here just pass `input` straight through unchanged.
type Tone = 'formal' | 'neutral' | 'friendly';

const TONE_LABELS: Record<Tone, string> = {
  formal: 'Formal — suitable for business communication',
  neutral: 'Neutral — suitable for someone you know but aren\'t close with',
  friendly: 'Friendly — suitable for a close friend',
};

interface ReplyStarterInput {
  message: string;
  tone?: Tone;
  verbosity?: 'short' | 'medium' | 'long';
  intent?: string;
}

const VERBOSITY_LABELS: Record<NonNullable<ReplyStarterInput['verbosity']>, string> = {
  short: 'Short — a sentence or less per draft',
  medium: 'Medium — one to three sentences per draft',
  long: 'Long — a short paragraph per draft',
};

export function buildReplyStarterMessage(rawInput: string): string {
  let parsed: Partial<ReplyStarterInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const tone = parsed.tone && TONE_LABELS[parsed.tone] ? parsed.tone : 'neutral';
  const verbosity = parsed.verbosity && VERBOSITY_LABELS[parsed.verbosity] ? parsed.verbosity : 'medium';
  const intent = parsed.intent?.trim();

  return [
    `Message to reply to:\n"""\n${message}\n"""`,
    `Desired tone: ${TONE_LABELS[tone]}`,
    `Desired length: ${VERBOSITY_LABELS[verbosity]}`,
    intent ? `Desired intent for the reply: ${intent}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface ToneCheckerInput {
  message: string;
  context?: string;
}

export function buildToneCheckerMessage(rawInput: string): string {
  let parsed: Partial<ToneCheckerInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const context = parsed.context?.trim();

  return [
    `Message to check:\n"""\n${message}\n"""`,
    context ? `Context for the situation: ${context}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface CallScriptInput {
  message: string;
  tone?: Tone;
  about?: string;
}

export function buildCallScriptMessage(rawInput: string): string {
  let parsed: Partial<CallScriptInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const tone = parsed.tone && TONE_LABELS[parsed.tone] ? parsed.tone : 'neutral';
  const about = parsed.about?.trim();

  return [
    `What the call needs to accomplish:\n"""\n${message}\n"""`,
    `Desired tone: ${TONE_LABELS[tone]}`,
    about ? `Who the call is to: ${about}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface IsThisMadInput {
  message: string;
  context?: string;
}

export function buildIsThisMadMessage(rawInput: string): string {
  let parsed: Partial<IsThisMadInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const context = parsed.context?.trim();

  return [
    `Message they sent:\n"""\n${message}\n"""`,
    context ? `Context for the situation: ${context}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

const USER_MESSAGE_BUILDERS: Record<string, (rawInput: string) => string> = {
  'reply-starter': buildReplyStarterMessage,
  'tone-checker': buildToneCheckerMessage,
  'call-script': buildCallScriptMessage,
  'is-this-mad': buildIsThisMadMessage,
};

// Every AI tool request is wrapped by useAiTool.ts as {spoons, input} — spoons
// is the user's self-reported 0-100 energy level ("Spoon Theory"). Unwrapping
// happens once here, uniformly, so every current and future AI tool adjusts
// response complexity automatically without needing its own energy handling.
interface RequestEnvelope {
  spoons?: number;
  input: string;
}

export function parseEnvelope(rawInput: string): RequestEnvelope {
  try {
    const parsed = JSON.parse(rawInput);
    if (parsed && typeof parsed === 'object' && typeof parsed.input === 'string') {
      return {
        spoons: typeof parsed.spoons === 'number' ? parsed.spoons : undefined,
        input: parsed.input,
      };
    }
  } catch {
    // Not JSON, or not shaped like our envelope — treat the whole raw string as the input.
  }
  return { input: rawInput };
}

export function buildEnergyInstruction(spoons: number | undefined): string | undefined {
  if (spoons === undefined) return undefined;

  if (spoons <= 33) {
    return `The user's current energy is low (${spoons}/100 spoons). Keep your response as simple and low-effort as possible to process — fewer steps or words, plain and gentle language, nothing that adds extra decisions or nuance to weigh up.`;
  }
  if (spoons <= 66) {
    return `The user's current energy is medium (${spoons}/100 spoons). Respond with your usual level of detail.`;
  }
  return `The user's current energy is high (${spoons}/100 spoons). You can be more thorough and detailed than usual if that's genuinely useful — the user has the capacity for it right now.`;
}

export const handler: Schema['runAiTool']['functionHandler'] = async (event) => {
  const { toolId, input: rawInput } = event.arguments;

  const systemPrompt = SYSTEM_PROMPTS[toolId];
  if (!systemPrompt) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const { spoons, input } = parseEnvelope(rawInput);
  const buildUserMessage = USER_MESSAGE_BUILDERS[toolId];
  const toolMessage = buildUserMessage ? buildUserMessage(input) : input;
  const energyInstruction = buildEnergyInstruction(spoons);
  const userMessage = energyInstruction ? `${energyInstruction}\n\n${toolMessage}` : toolMessage;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );

  return textBlock?.text ?? '';
};
