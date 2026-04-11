import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
    const PLAID_SECRET = Deno.env.get('PLAID_SECRET');

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      throw new Error("Plaid API credentials are missing in Environment Variables!");
    }

    let body = {};
    try { body = await req.json(); } catch(e) {}
    
    const userId = body.userId || 'guest_' + crypto.randomUUID();

    const payload = {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      client_name: 'SubTrack Fintech',
      language: 'it',
      // Plaid support in EU
      country_codes: ['IT', 'GB', 'FR', 'ES', 'DE', 'IE', 'NL'],
      user: {
        client_user_id: userId
      },
      products: ['transactions']
    };

    const response = await fetch('https://sandbox.plaid.com/link/token/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Plaid Create Link Error:", JSON.stringify(data));
      throw new Error(data.error_message || data.display_message || JSON.stringify(data));
    }

    return new Response(JSON.stringify({ link_token: data.link_token }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
