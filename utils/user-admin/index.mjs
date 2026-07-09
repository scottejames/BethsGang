#!/usr/bin/env node
// Admin CLI for managing signed-up users: list, delete (with confirmation + data
// cleanup), reset password, and list a user's stored data.
//
// No credentials or environment-specific IDs (Cognito pool, table names, region) live
// in this file — it's committed to git. All of that lives in ./config.json, which is
// gitignored. AWS credentials themselves are never read from config; this tool relies
// on your normal AWS CLI credential chain (env vars, ~/.aws/credentials, SSO, etc.),
// exactly like running `aws` commands directly.
//
// Usage:
//   node utils/user-admin/index.mjs list-users
//   node utils/user-admin/index.mjs list-data <email-or-username>
//   node utils/user-admin/index.mjs reset-password <email-or-username>
//   node utils/user-admin/index.mjs delete-user <email-or-username>
//   node utils/user-admin/index.mjs discover

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'config.json');

const BLANK_CONFIG = {
  region: '',
  userPoolId: '',
  remindersTableName: '',
  userPreferencesTableName: '',
};

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(BLANK_CONFIG, null, 2) + '\n');
    console.log(`No config found — created a blank one at ${CONFIG_PATH}`);
    console.log('Fill in region / userPoolId / table names before running any other command.');
    console.log('Run `discover` for help finding the right values, then edit config.json.');
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return config;
}

function requireConfigFilledIn(config) {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    console.error(`config.json is missing: ${missing.join(', ')}`);
    console.error('Run `discover` for help finding the right values, then edit config.json.');
    process.exit(1);
  }
}

function clients(config) {
  return {
    cognito: new CognitoIdentityProviderClient({ region: config.region }),
    dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region })),
  };
}

// Owner field on Reminder/UserPreferences rows is "<sub>::<username>" (Amplify's
// allow.owner() format) — matching by prefix works regardless of what's after the
// "::", rather than assuming username always equals sub.
async function scanOwnedBy(dynamo, tableName, sub) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(#owner, :prefix)',
        ExpressionAttributeNames: { '#owner': 'owner' },
        ExpressionAttributeValues: { ':prefix': `${sub}::` },
        ExclusiveStartKey,
      }),
    );
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function deleteItems(dynamo, tableName, items) {
  for (const item of items) {
    await dynamo.send(new DeleteCommand({ TableName: tableName, Key: { id: item.id } }));
  }
}

async function resolveUser(cognito, userPoolId, emailOrUsername) {
  const result = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: userPoolId, Username: emailOrUsername }),
  );
  const email = result.UserAttributes?.find((a) => a.Name === 'email')?.Value ?? '(no email)';
  return { sub: result.Username, email, status: result.UserStatus, enabled: result.Enabled };
}

async function cmdListUsers(config) {
  const { cognito } = clients(config);
  let PaginationToken;
  const rows = [];
  do {
    const result = await cognito.send(
      new ListUsersCommand({ UserPoolId: config.userPoolId, PaginationToken }),
    );
    for (const user of result.Users ?? []) {
      const email = user.Attributes?.find((a) => a.Name === 'email')?.Value ?? '(no email)';
      rows.push({
        username: user.Username,
        email,
        status: user.UserStatus,
        enabled: user.Enabled,
        created: user.UserCreateDate?.toISOString().slice(0, 10),
      });
    }
    PaginationToken = result.PaginationToken;
  } while (PaginationToken);

  if (rows.length === 0) {
    console.log('No users found.');
    return;
  }
  console.table(rows);
}

async function cmdListData(config, emailOrUsername) {
  if (!emailOrUsername) {
    console.error('Usage: list-data <email-or-username>');
    process.exit(1);
  }
  const { cognito, dynamo } = clients(config);
  const user = await resolveUser(cognito, config.userPoolId, emailOrUsername);
  console.log(`User: ${user.email} (${user.sub})\n`);

  const reminders = await scanOwnedBy(dynamo, config.remindersTableName, user.sub);
  console.log(`Reminders (${reminders.length}):`);
  if (reminders.length > 0) {
    console.table(
      reminders.map((r) => ({ id: r.id, message: r.message, fireAt: r.fireAt, repeat: r.repeat })),
    );
  }

  const preferences = await scanOwnedBy(dynamo, config.userPreferencesTableName, user.sub);
  console.log(`\nUserPreferences (${preferences.length}):`);
  if (preferences.length > 0) {
    console.table(preferences.map((p) => ({ id: p.id, spoons: p.spoons })));
  }
}

async function cmdResetPassword(config, emailOrUsername) {
  if (!emailOrUsername) {
    console.error('Usage: reset-password <email-or-username>');
    process.exit(1);
  }
  const { cognito } = clients(config);
  const user = await resolveUser(cognito, config.userPoolId, emailOrUsername);

  // Meets Cognito's default password policy (8+ chars, upper, lower, digit, symbol).
  const newPassword = `${randomBytes(9).toString('base64url')}Aa1!`;

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: config.userPoolId,
      Username: user.sub,
      Password: newPassword,
      Permanent: true,
    }),
  );

  console.log(`Password reset for ${user.email}.`);
  console.log(`New password (shown once, not stored anywhere): ${newPassword}`);
}

async function cmdDeleteUser(config, emailOrUsername) {
  if (!emailOrUsername) {
    console.error('Usage: delete-user <email-or-username>');
    process.exit(1);
  }
  const { cognito, dynamo } = clients(config);
  const user = await resolveUser(cognito, config.userPoolId, emailOrUsername);

  const reminders = await scanOwnedBy(dynamo, config.remindersTableName, user.sub);
  const preferences = await scanOwnedBy(dynamo, config.userPreferencesTableName, user.sub);

  console.log(`About to permanently delete:`);
  console.log(`  User: ${user.email} (${user.sub})`);
  console.log(`  Reminders: ${reminders.length}`);
  console.log(`  UserPreferences rows: ${preferences.length}`);
  console.log();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`Type the user's email (${user.email}) to confirm deletion: `);
  rl.close();

  if (typed.trim() !== user.email) {
    console.log('Confirmation did not match — nothing was deleted.');
    process.exit(1);
  }

  await deleteItems(dynamo, config.remindersTableName, reminders);
  await deleteItems(dynamo, config.userPreferencesTableName, preferences);
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: config.userPoolId, Username: user.sub }));

  console.log(`Deleted ${user.email}: the Cognito account, ${reminders.length} reminder(s), and ${preferences.length} preferences row(s).`);
}

async function cmdDiscover() {
  console.log('Looking for values to put in config.json...\n');

  const outputsPath = join(__dirname, '..', '..', 'amplify_outputs.json');
  const region = existsSync(outputsPath)
    ? JSON.parse(readFileSync(outputsPath, 'utf8')).auth?.aws_region
    : undefined;
  const userPoolId = existsSync(outputsPath)
    ? JSON.parse(readFileSync(outputsPath, 'utf8')).auth?.user_pool_id
    : undefined;

  if (region) {
    console.log('From amplify_outputs.json (currently deployed sandbox):');
    console.log(`  region:     ${region}`);
    console.log(`  userPoolId: ${userPoolId ?? '(not found)'}`);
    console.log();
  } else {
    console.log('No amplify_outputs.json found — run `npx ampx sandbox` first, or fill in');
    console.log('region/userPoolId manually (Amplify Console, or `aws cognito-idp list-user-pools`).\n');
    return;
  }

  const dynamo = new DynamoDBClient({ region });
  const result = await dynamo.send(new ListTablesCommand({}));
  const candidates = (result.TableNames ?? []).filter(
    (name) => name.startsWith('Reminder-') || name.startsWith('UserPreferences-'),
  );
  console.log('Candidate DynamoDB table names:');
  candidates.forEach((name) => console.log(`  ${name}`));
  if (candidates.length === 0) console.log('  (none found — has the sandbox finished deploying?)');
}

async function main() {
  const [, , command, arg] = process.argv;

  if (command === 'discover') {
    await cmdDiscover();
    return;
  }

  const config = loadConfig();
  requireConfigFilledIn(config);

  switch (command) {
    case 'list-users':
      await cmdListUsers(config);
      break;
    case 'list-data':
      await cmdListData(config, arg);
      break;
    case 'reset-password':
      await cmdResetPassword(config, arg);
      break;
    case 'delete-user':
      await cmdDeleteUser(config, arg);
      break;
    default:
      console.log('Usage: node utils/user-admin/index.mjs <command> [arg]');
      console.log('Commands: list-users, list-data <user>, reset-password <user>, delete-user <user>, discover');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
