// Supabase Edge Function: stripe-checkout
// Deploy with: supabase functions deploy stripe-checkout
//
// HOW TO SET SECRETS:
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
//   supabase secrets set STRIPE_PRICE_ID=price_xxx
//   supabase secrets set APP_URL=https://your-app.vercel.app

import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { user_id, email } = await req.json();
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
    const priceId = Deno.env.get('STRIPE_PRICE_ID') ?? '';

    // Create or retrieve Stripe Customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer = customers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: user_id },
      });
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appUrl}/?payment=success`,
      cancel_url: `${appUrl}/?payment=cancelled`,
      metadata: { user_id },
      subscription_data: {
        metadata: { user_id },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
