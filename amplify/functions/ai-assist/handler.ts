import Anthropic from '@anthropic-ai/sdk';
import type { Schema } from '../../data/resource';

const client = new Anthropic();

// Adding a new AI-backed tool only requires a new entry here plus a
// matching frontend tool component — no new infrastructure.
const SYSTEM_PROMPTS: Record<string, string> = {
  'task-breakdown': `You help people with ADHD turn overwhelming tasks into small, concrete, startable steps.
Given a task, break it into a short ordered checklist of 3-8 steps.
Each step should be small enough to start immediately, described as a physical or concrete action (not "plan" or "think about").
Do not add commentary, encouragement, or headers — respond with the checklist only, one step per line, formatted as "1. ...".`,

  'tone-checker': `You help people with ADHD who worry their written messages (emails, texts, Slack) come across wrong before they send them.
Given a message, respond in this exact format:
Tone: <one or two words, e.g. "Neutral", "Blunt", "Friendly">
Likely to land as: <one sentence on how a reader would probably perceive it>
Suggestion: <one short concrete rewrite tip, or "None needed" if the message is fine as-is>
Be reassuring and non-judgmental. Do not rewrite the whole message unless asked.`,
};

export const handler: Schema['runAiTool']['functionHandler'] = async (event) => {
  const { toolId, input } = event.arguments;

  const systemPrompt = SYSTEM_PROMPTS[toolId];
  if (!systemPrompt) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: input }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );

  return textBlock?.text ?? '';
};
