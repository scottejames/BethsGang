/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const outputs = JSON.parse(readFileSync('amplify_outputs.json', 'utf8')) as {
  auth: { user_pool_id: string; aws_region: string };
};

const poolId = outputs.auth.user_pool_id;
const region = outputs.auth.aws_region;
const USER_PREFIX = 'live-check-';

function aws(service: string, command: string, ...args: string[]): string {
  return execFileSync('aws', [service, command, '--region', region, '--output', 'json', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Checks AWS's own tag on the pool, rather than a list of known production ids that
// would silently stop protecting production if those ids ever changed.
export function assertSandbox(): void {
  const { UserPool } = JSON.parse(aws('cognito-idp', 'describe-user-pool', '--user-pool-id', poolId));
  const deploymentType = UserPool.UserPoolTags?.['amplify:deployment-type'];
  if (deploymentType !== 'sandbox') {
    throw new Error(
      `Refusing to run: amplify_outputs.json points at a "${deploymentType}" backend, not a sandbox.`,
    );
  }
}

export interface DisposableUser {
  username: string;
  password: string;
}

export function createDisposableUser(): DisposableUser {
  const username = `${USER_PREFIX}${randomUUID()}@example.com`;
  const password = `Aa1!${randomBytes(18).toString('base64url')}`;
  aws(
    'cognito-idp',
    'admin-create-user',
    '--user-pool-id',
    poolId,
    '--username',
    username,
    '--user-attributes',
    `Name=email,Value=${username}`,
    'Name=email_verified,Value=true',
    '--message-action',
    'SUPPRESS',
  );
  aws(
    'cognito-idp',
    'admin-set-user-password',
    '--user-pool-id',
    poolId,
    '--username',
    username,
    '--password',
    password,
    '--permanent',
  );
  return { username, password };
}

export function deleteDisposableUser(username: string): void {
  aws('cognito-idp', 'admin-delete-user', '--user-pool-id', poolId, '--username', username);
}

// Clears users left by a run that was killed before its own cleanup.
export function deleteLeftoverUsers(): void {
  const { Users } = JSON.parse(
    aws('cognito-idp', 'list-users', '--user-pool-id', poolId, '--filter', `email ^= "${USER_PREFIX}"`),
  ) as { Users: { Username: string }[] };
  Users.forEach((user) => deleteDisposableUser(user.Username));
}
