import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

serve(async (req) => {
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("SUPABASE_DB_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variabili d'ambiente segrete mancanti.");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Definisci il range del Mese Corrente (dal giorno 1 all'ultimo giorno del mese)
    // Dato che il cron gira il 1° del mese, today è "Y-M-01".
    const today = new Date();
    // Forza a inizio mese corrente UTC
    const startOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

    const startDateStr = startOfMonth.toISOString().split("T")[0];
    const endDateStr = endOfMonth.toISOString().split("T")[0];

    console.log(`[Recap Mensile] Mese in corso: da ${startDateStr} a ${endDateStr}`);

    // 2. Cerchiamo TUTTI gli abbonamenti di qualsiasi utente PRO che rinnovino questo mese
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select(`
        *,
        profiles!inner(email, is_pro, recap_email_enabled)
      `)
      .eq("profiles.is_pro", true)
      .eq("profiles.recap_email_enabled", true)
      .gte("next_renewal", startDateStr)
      .lte("next_renewal", endDateStr);

    if (error) {
      throw new Error(`Errore DB: ${error.message}`);
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ messaggio: "Nessun rinnovo mensile per utenti PRO trovato." }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Raggruppiamo gli abbonamenti per Utente (cioè per l'email dell'owner del profilo PRO)
    const userMap = new Map();

    for (const sub of subs) {
      const userEmail = sub.profiles.email;
      if (!userMap.has(userEmail)) {
        userMap.set(userEmail, { email: userEmail, subscriptions: [], total: 0 });
      }
      const data = userMap.get(userEmail);
      data.subscriptions.push(sub);
      data.total += parseFloat(sub.price);
    }

    console.log(`Raggruppati i rinnovi per ${userMap.size} utenti PRO totali.`);

    let inviate = 0;

    // 4. Creazione Email per ciascun Utente e invio
    for (const [userEmail, userData] of userMap.entries()) {
      // Formatta la lista abbonamenti (HTML)
      let listHtml = "";
      userData.subscriptions
        .sort((a, b) => new Date(a.next_renewal).getTime() - new Date(b.next_renewal).getTime())
        .forEach(sub => {
          const dateStr = new Date(sub.next_renewal).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
          const engDateStr = new Date(sub.next_renewal).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
          
          listHtml += `
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
              <span style="font-weight: 600;">${sub.name}</span>
              <span>
                <span style="color: #666; font-size: 0.85em; margin-right: 15px;">${dateStr} (${engDateStr})</span>
                <strong>€${parseFloat(sub.price).toFixed(2)}</strong>
              </span>
            </div>
          `;
        });

      const totalFormatted = userData.total.toFixed(2);
      const monthLabelIt = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(today).toUpperCase();
      const monthLabelEn = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(today).toUpperCase();

      // DUAL LANGUAGE TEMPLATE
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; max-width: 600px; margin: 0 auto; padding: 30px 20px; background: #fafafa; border-radius: 12px; border: 1px solid #e5e7eb;">
          
          <!-- ITALIAN SECTION -->
          <div style="margin-bottom: 40px;">
            <h2 style="color: #6D28D9; font-size: 24px; margin-top: 0;">Riepilogo Mensile - ${monthLabelIt}</h2>
            <p style="font-size: 16px; color: #4B5563;">Ciao,</p>
            <p style="font-size: 16px; color: #4B5563;">Questa è la tua panoramica esclusiva per il mese di <strong>${monthLabelIt}</strong>. Assicurati che le tue carte abbiano la copertura necessaria per le prossime uscite.</p>
            
            <div style="background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-top: 25px;">
              <p style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; color: #9CA3AF; margin-top: 0;">Usite Previste Questo Mese</p>
              ${listHtml}
              <div style="display: flex; justify-content: space-between; padding-top: 15px; margin-top: 10px; border-top: 2px solid #6D28D9;">
                <span style="font-weight: 800; color: #111;">TOTALE PREVISTO</span>
                <span style="font-weight: 800; color: #6D28D9; font-size: 1.1em;">€${totalFormatted}</span>
              </div>
            </div>
          </div>

          <!-- DIVISORE -->
          <hr style="border: 0; height: 1px; background: #e5e7eb; margin: 40px 0;" />

          <!-- ENGLISH SECTION -->
          <div>
            <h2 style="color: #6D28D9; font-size: 20px; margin-top: 0;">Monthly Overview - ${monthLabelEn}</h2>
            <p style="font-size: 15px; color: #4B5563;">Hi there,</p>
            <p style="font-size: 15px; color: #4B5563;">Here is your exclusive financial overview for <strong>${monthLabelEn}</strong>. Make sure your payment methods are funded for the upcoming charges.</p>
          </div>

          <!-- SIGNATURE -->
          <div style="text-align: center; margin-top: 50px;">
            <p style="font-size: 13px; color: #6B7280; font-weight: 600;">Team SubTrack</p>
          </div>
        </div>
      `;

      // Invia la Mail col fetch nativo (per sicurezza cloud)
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "SubTrack Recap <onboarding@resend.dev>",
          to: [userEmail],
          subject: `Riepilogo Abbonamenti di ${monthLabelIt} | SubTrack PRO`,
          html: htmlContent,
        })
      });

      if (res.ok) {
        console.log(`Recap mensile inviato a: ${userEmail}`);
        inviate++;
      } else {
        const errTesto = await res.text();
        console.error(`Errore API Resend per recap a ${userEmail}:`, errTesto);
      }
    }

    return new Response(
      JSON.stringify({ 
        messaggio: "Esecuzione recap completata.", 
        utenti_pro_avvisati: inviate 
      }), 
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Errore critico Recap Edge Function:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
