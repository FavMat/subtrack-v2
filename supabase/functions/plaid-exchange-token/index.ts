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

    const { public_token } = await req.json();

    if (!public_token) {
       throw new Error("Missing public_token in payload.");
    }

    const payload = {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      public_token: public_token
    };

    const response = await fetch('https://sandbox.plaid.com/item/public_token/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
       console.error("Plaid Exchange Token Error:", data);
       throw new Error(data.error_message || "Failed to exchange Plaid token");
    }
    
    // Per il momento questo access_token dovra essere iniettato in bank_connections per l'utente,
    // o passato in background.
    return new Response(JSON.stringify({ 
      access_token: data.access_token, 
      item_id: data.item_id 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
})
