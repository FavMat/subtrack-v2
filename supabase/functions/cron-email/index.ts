import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";


// Questa funzione viene scatenata ogni giorno alle 08:00 AM da pg_cron
serve(async (req) => {
  try {
    // 1. Inizializzazione Chiavi di Sicurezza
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("SUPABASE_DB_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Mancano le variabili d'ambiente segrete.");
    }

    // Usiamo il Service Role (Bypass RLS) perché il cron gira in background senza utente loggato
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Calcolo Date (Cerchiamo chi rinnova esattamente tra 7 giorni)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    console.log(`[Motore Email] Ricerca rinnovi condivisi previsti per la data: ${targetDateStr}`);

    // 3. Query Potente su Supabase
    // Vogliamo: abbonamenti condivisi, con una mail valida, con alert attivo, non ancora pagati = oggi a -7 giorni.
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select(`
        *,
        profiles!inner(email, is_pro)
      `)
      .eq("is_shared", true)
      .not("shared_email", "is", null)
      .not("shared_reminder_cycle", "is", null)
      .eq("shared_has_paid", false)
      .eq("next_renewal", targetDateStr);

    if (error) {
      throw new Error(`Errore DB: ${error.message}`);
    }

    console.log(`Trovati ${subs?.length || 0} abbonamenti condivisi da notificare.`);

    let inviate = 0;

    // 4. Ciclo di Invio Email tramite Resend
    for (const sub of (subs || [])) {
      // Blocco di Sicurezza Paywall: se chi ha creato l'abbonamento non è più PRO, non inviare.
      if (!sub.profiles.is_pro) {
         console.log(`Ignoro ${sub.name} perché il proprietario non è utente PRO.`);
         continue;
      }
      
      const nomeDestinatario = sub.shared_name || "Amico";
      const amicoChePaga = sub.profiles.email;
      const costo = parseFloat(sub.price).toFixed(2);

      // Logica dei testi (Chi deve a Chi)
      const debitoreTesto = sub.shared_payment_status === "devo" 
        ? `L'amico <strong>${amicoChePaga}</strong> paga questo abbonamento, ma ricorda che tu devi dargli la tua quota.` 
        : `L'amico <strong>${amicoChePaga}</strong> (chi ti ha invitato) sta aspettando la tua quota per l'abbonamento.`;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6D28D9;">Promemoria: ${sub.name}</h2>
          <p>Ciao <strong>${nomeDestinatario}</strong>,</p>
          <p>L'abbonamento condiviso <strong>${sub.name}</strong> (${costo}€ ogni ${sub.cycle}) scatta tra esattament 1 settimana (il ${targetDateStr}).</p>
          <div style="padding: 15px; background: #f3f4f6; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Sintesi dei movimenti:</strong></p>
            <p style="margin-top: 5px;">${debitoreTesto}</p>
          </div>
          <p>Potete mettervi d'accordo per regolarizzare i conti prima che scatti il ciclo di fatturazione!</p>
          <p style="margin-top: 30px;"><small style="color: #999;">Email generata ed inviata automaticamente da SubTrack PRO</small></p>
        </div>
      `;

      // Sparo fisico dell'email usando fetch nativo per evitare conflitti con Deno esm
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "SubTrack Reminders <onboarding@resend.dev>", // Indirizzo default Resend per i test
          to: [sub.shared_email],
          subject: `Promemoria Spesa Condivisa: ${sub.name}`,
          html: htmlContent,
        })
      });

      if (res.ok) {
        console.log(`Email inviata con successo a: ${sub.shared_email}`);
        inviate++;
      } else {
        const errTesto = await res.text();
        console.error(`Errore API Resend a ${sub.shared_email}:`, errTesto);
      }
    }

    return new Response(
      JSON.stringify({ 
        messaggio: "Esecuzione completata.", 
        abbonamenti_scansionati: subs?.length || 0, 
        email_inviate: inviate 
      }), 
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Errore critico Edge Function:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
