/**
 * SMS Re-engagement Infrastructure
 *
 * Placeholder for Twilio SMS integration.
 * When TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER
 * environment variables are set, these functions will send real SMS messages.
 *
 * Setup: npm install twilio
 * Docs: https://www.twilio.com/docs/sms/quickstart/node
 */

interface SMSMessage {
  to: string;
  body: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function sendSMS(message: SMSMessage): Promise<boolean> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.log(`[SMS Stub] Would send to ${message.to}: "${message.body}"`);
    return false;
  }

  // TODO: Uncomment when twilio is installed
  // const twilio = (await import("twilio")).default;
  // const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   body: message.body,
  //   from: TWILIO_PHONE_NUMBER,
  //   to: message.to,
  // });
  return true;
}

/**
 * Re-engagement campaign templates.
 * Called by a scheduled job (cron) — see CLAUDE.md for architecture notes.
 */

export function getDormantCustomerMessage(customerName: string): string {
  const firstName = customerName.split(" ")[0];
  return `Hey ${firstName}! We miss you at Sud Italia 🍕 Order this week and get a free drink — just show this SMS. suditalia.pl`;
}

export function getStreakReminderMessage(customerName: string, streakWeeks: number): string {
  const firstName = customerName.split(" ")[0];
  return `${firstName}, you're on a ${streakWeeks}-week streak! 🔥 Don't break it — order today and keep earning bonus points. suditalia.pl`;
}

export function getPointsMilestoneMessage(customerName: string, points: number, nextReward: string): string {
  const firstName = customerName.split(" ")[0];
  return `${firstName}, you have ${points} points! You're close to a ${nextReward}. Order now to unlock it → suditalia.pl`;
}

export function getWelcomeMessage(customerName: string): string {
  const firstName = customerName.split(" ")[0];
  return `Welcome to Sud Italia, ${firstName}! 🇮🇹 You earned points on your first order. Check your rewards → suditalia.pl/rewards`;
}

/**
 * Re-engagement trigger conditions (for cron job implementation).
 *
 * Trigger: "dormant" — customer hasn't ordered in 14+ days
 * Trigger: "streak_risk" — customer has 3+ week streak, hasn't ordered this week (by Thursday)
 * Trigger: "points_milestone" — customer is within 20% of next reward threshold
 * Trigger: "welcome" — 24 hours after first order
 */
export const REENGAGEMENT_TRIGGERS = {
  dormant: { daysInactive: 14, maxSendsPerMonth: 2 },
  streakRisk: { dayOfWeek: 4 /* Thursday */, minStreak: 3 },
  pointsMilestone: { thresholdPercent: 0.8 },
  welcome: { hoursAfterFirstOrder: 24 },
} as const;
