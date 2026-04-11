import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get Auth user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Non autorizzato');

    // MOCK TRANSACTIONS (Simuliamo quello che arriverebbe da GoCardless o Plaid)
    const mockFeed = [
      { amount: 10.99, desc: "NETFLIX AMSTERDAM", date: new Date().toISOString() },
      { amount: 4.99, desc: "Sotispay* Spotify", date: new Date().toISOString() },
      { amount: 2.99, desc: "iCloud Storage Apple", date: new Date().toISOString() },
      { amount: -4.99, desc: "Bonifico in ingresso da Marco Rossi", date: new Date().toISOString() } // Quota
    ];

    // INSERIMENTO TRANSAZIONI RAW (A scopo log e storico)
    // Richiede che ci sia prima una bank_connection (ignoriamo per il mock rapido o la creiamo)
    const { data: bankConn } = await supabaseClient.from('bank_connections').select('id').eq('user_id', user.id).limit(1).single();
    
    let connId = bankConn?.id;
    if (!connId) {
       const { data: newConn } = await supabaseClient.from('bank_connections').insert({ user_id: user.id, provider_name: 'MockBank', account_id: 'IT123...456' }).select('id').single();
       connId = newConn?.id;
    }

    if (connId) {
      const txs = mockFeed.map(t => ({
          user_id: user.id,
          bank_connection_id: connId,
          amount: t.amount,
          description: t.desc,
          date: t.date.split('T')[0]
      }));
      await supabaseClient.from('transactions').insert(txs);
    }

    // ELABORAZIONE E AGGIORNAMENTO SUBSCRIPTIONS
    // Ricerca semplice tramite keyword per abbonamenti
    const keywords = [
      { key: 'NETFLIX', name: 'Netflix', price: 10.99, category: 'entertainment', cycle: 'monthly' },
      { key: 'SPOTIFY', name: 'Spotify', price: 4.99, category: 'entertainment', cycle: 'monthly' }
    ];

    const detectedSubs = [];

    for (const tx of mockFeed) {
      // Ignoriamo ricariche o entrate generiche nel flusso abbonamenti
      if (tx.amount < 0 && tx.desc.toUpperCase().includes('MARCO')) {
        // MATCH CONDIVISIONE: marco ha pagato la quota. 
        // Cerchiamo un abbonamento condiviso con Marco
        const { data: subcond } = await supabaseClient
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .ilike('shared_name', '%Marco%')
            .limit(1)
            .single();
        
        if (subcond && !subcond.shared_has_paid) {
            await supabaseClient.from('subscriptions').update({ shared_has_paid: true }).eq('id', subcond.id);
        }
      }

      if (tx.amount > 0) {
        for (const kw of keywords) {
          if (tx.desc.toUpperCase().includes(kw.key)) {
            // Controlla se l'abbonamento esiste già (case-insensitive name match grossolano)
            const { data: existing } = await supabaseClient
               .from('subscriptions')
               .select('id')
               .eq('user_id', user.id)
               .ilike('name', `%${kw.key}%`);
            
            if (!existing || existing.length === 0) {
               // Inserimento Auto-Sync
               await supabaseClient.from('subscriptions').insert({
                 user_id: user.id,
                 name: kw.name,
                 price: tx.amount, // Usa il prezzo reale preso dalla banca
                 cycle: kw.cycle,
                 category: kw.category,
                 auto_synced: true,
                 last_payment_date: tx.date.split('T')[0],
                 next_renewal: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
               });
               detectedSubs.push(kw.name);
            } else {
               // Se esiste, aggiorniamo il last_payment_date e auto_synced tag
               await supabaseClient.from('subscriptions')
                 .update({ auto_synced: true, last_payment_date: tx.date.split('T')[0] })
                 .eq('id', existing[0].id);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, new_subs: detectedSubs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
