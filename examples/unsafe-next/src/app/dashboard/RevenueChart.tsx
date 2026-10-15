'use client';

// Placeholder fixture: VibePreflight flags the reference, the value is never read.
const stripeKey = process.env.STRIPE_SECRET_KEY;

export function RevenueChart() {
  return <div data-configured={Boolean(stripeKey)}>Revenue chart</div>;
}
