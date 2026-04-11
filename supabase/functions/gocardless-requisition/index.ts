import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { providerId, redirectUrl, token } = await req.json();

    if (!providerId || !redirectUrl || !token) {
       throw new Error("Missing providerId, redirectUrl, or GoCardless token in payload.");
    }

    // 1. Create an End User Agreement for 90 days transaction access
    const agreementRes = await fetch('https://bankaccountdata.gocardless.com/api/v2/agreements/nordigen/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
         institution_id: providerId, // Es. 'SANDBOXFINANCE_SFIN0000'
         max_historical_days: 90,
         access_valid_for_days: 90,
         access_scope: ["balances", "details", "transactions"]
      })
    });
    
    if (!agreementRes.ok) {
       const err = await agreementRes.text();
       throw new Error(`[Agreement Creation Failed]: ${err}`);
    }
    const agreement = await agreementRes.json();

    // 2. Create Requisition and linking it to the agreement
    const reqRes = await fetch('https://bankaccountdata.gocardless.com/api/v2/requisitions/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
         redirect: redirectUrl, // Dove ritornerà l'utente dopo il pin della banca
         institution_id: providerId,
         reference: `subtrack_user_${crypto.randomUUID()}`,
         agreement: agreement.id,
         user_language: "IT"
      })
    });

    if (!reqRes.ok) {
       const err = await reqRes.text();
       throw new Error(`[Requisition Creation Failed]: ${err}`);
    }
    const requisition = await reqRes.json();

    // Restituiamo il BLOCCO necessario al frontend per portare avanti il flusso
    return new Response(JSON.stringify({ 
      link: requisition.link, 
      requisition_id: requisition.id 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
})
