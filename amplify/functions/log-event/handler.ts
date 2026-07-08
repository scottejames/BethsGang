import type { Schema } from '../../data/resource';

// Deliberately separate from ai-assist: no Anthropic SDK, own CloudWatch log group, so
// usage-tracking traffic never gets mixed in with actual Claude request/response logs.
// Every line is a single JSON object so CloudWatch Logs Insights can query it later.
export const handler: Schema['logEvent']['functionHandler'] = async (event) => {
  try {
    const payload = JSON.parse(event.arguments.input);
    console.log(JSON.stringify({ type: 'usage', ...payload }));
  } catch {
    // Never let a malformed payload break logging (or the caller) — log what we can.
    console.log(JSON.stringify({ type: 'usage', raw: event.arguments.input }));
  }

  return 'ok';
};
