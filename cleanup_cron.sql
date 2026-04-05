-- 1. Attivazione dell'estensione Cron (se non già attivata in precedenza)
create extension if not exists pg_cron;

-- 2. Timer Giornaliero per Sospensione Account Scaduti (Ore 00:00 Mezzanotte UTC)
SELECT cron.schedule(
  'invoke-cron-downgrade-expired-pro', -- Nome indentificativo del task
  '0 0 * * *',                         -- Tutti i giorni a mezzanotte precisa
  $$
    UPDATE public.profiles 
    SET is_pro = false, is_pro_manual = false 
    WHERE pro_expires_at < NOW() 
      AND (is_pro = true OR is_pro_manual = true);
  $$
);

-- ===============================================================
-- INFO UTILI: 
-- Quando tu andrai a regalare l'abbonamento PRO a qualcuno da Supabase:
-- 1. Metterai is_pro_manual = TRUE
-- 2. Sulla colonna pro_expires_at scriverai la data esatta di quanto vuoi che scada (es. 2026-12-31 23:59:00).
-- 
-- Allo scoccare del 1 Gennaio 2027 a mezzanotte, il sistema toglierà
-- in modo violento l'account PRO riportandolo a Free in millisecondi.
-- ===============================================================
