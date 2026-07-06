import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export async function runAiTool(toolId: string, input: string): Promise<string> {
  const { data, errors } = await client.queries.runAiTool({ toolId, input });

  if (errors?.length) {
    throw new Error(errors[0].message);
  }

  return data ?? '';
}
