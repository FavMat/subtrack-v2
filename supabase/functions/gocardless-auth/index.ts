import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SECRET_ID = Deno.env.get('GOCARDLESS_SECRET_ID');
    const SECRET_KEY = Deno.env.get('GOCARDLESS_SECRET_KEY');

    if (!SECRET_ID || !SECRET_KEY) {
      throw new Error("GoCardless API credentials are missing in Supabase Environment Variables!");
    }

    const response = await fetch('https://bankaccountdata.gocardless.com/api/v2/token/new/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ secret_id: SECRET_ID, secret_key: SECRET_KEY })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.summary || "Failed to fetch GoCardless token");
    }

    // Ritorniamo il token di accesso di breve durata (dura 24H)
    return new Response(JSON.stringify({ access: data.access }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
})
