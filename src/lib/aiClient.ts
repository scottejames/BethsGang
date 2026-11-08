import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// identityPool: runAiTool admits both Cognito Identity Pool roles (signed-out and
// signed-in), not the schema's defaultAuthorizationMode (see amplify/data/resource.ts).
const client = generateClient<Schema>({ authMode: 'identityPool' });

export async function runAiTool(toolId: string, input: string): Promise<string> {
  const { data, errors } = await client.queries.runAiTool({ toolId, input });

  if (errors?.length) {
    throw new Error(errors[0].message);
  }

  return data ?? '';
}
