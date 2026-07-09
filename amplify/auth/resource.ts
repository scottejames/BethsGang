import { defineAuth } from '@aws-amplify/backend';

// Email + password only for now — no social providers, no SMS (would need a verified
// origination number and costs money). Cognito's own default email sender handles
// verification/reset codes; fine for now but has a low daily quota if testing heavily.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
