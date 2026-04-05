-- ============================================================
-- AGGIORNAMENTO SCHEMA PER MODULO "CONDIVISO" ED "EMAIL ENGINE"
-- Esegui tutto questo blocco nell'SQL Editor di Supabase.
-- ============================================================

-- 1. AGGIUNTA COLONNE AVANZATE ALL'ABBONAMENTO (Se non le avevi ancora inserite)
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS shared_name text,
ADD COLUMN IF NOT EXISTS shared_email text,
ADD COLUMN IF NOT EXISTS shared_payment_status text DEFAULT 'devo',
ADD COLUMN IF NOT EXISTS shared_reminder_cycle text,
ADD COLUMN IF NOT EXISTS shared_has_paid boolean DEFAULT false;

-- 1.5 AGGIUNTA COLONNA PREFERENZE EMAIL AL PROFILO
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS recap_email_enabled boolean DEFAULT true;

-- 2. ABILITAZIONE ESTENSIONI DI RETE E CRON
-- Necessarie per far sì che il database possa mandare "ping" su internet
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 3. CREAZIONE DEL JOB MAIL GIORNALIERO (Ore 08:00 AM)
SELECT cron.schedule(
  'invoke-cron-email-daily-8am', -- Nome del task
  '0 8 * * *',                   -- Sintassi crontab: "Minuto 0, Ora 8, tutti i giorni" (UTC)
  $$
    select
      net.http_post(
          url:='https://zttaebpugrbgjsieknej.supabase.co/functions/v1/cron-email',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_h9I8vq48LEPwCTLwwyQpkA_93EoR0-_"}'::jsonb
      ) as request_id;
  $$
);

-- NOTE UTILI PER LA GESTIONE DEL CRON in pg_cron:
-- Per vedere i job attivi:   SELECT * FROM cron.job;
-- Per eliminare questo job:  SELECT cron.unschedule('invoke-cron-email-daily-8am');
-- Per vedere i log dei run:  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- 4. CREAZIONE DEL JOB RECAP MENSILE (1° del mese, ore 08:00 AM)
SELECT cron.schedule(
  'invoke-cron-monthly-recap-8am', -- Nome del task
  '0 8 1 * *',                     -- Sintassi crontab: "Minuto 0, Ora 8, Giorno 1, ogni mese" (UTC)
  $$
    select
      net.http_post(
          url:='https://zttaebpugrbgjsieknej.supabase.co/functions/v1/cron-monthly-recap',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_h9I8vq48LEPwCTLwwyQpkA_93EoR0-_"}'::jsonb
      ) as request_id;
  $$
);
