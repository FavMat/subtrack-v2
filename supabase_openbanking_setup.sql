-- =================================================================================
-- SUBTRACK V2 - OPEN BANKING MOCK SCHEMA
-- Esegui questo script nel SQL Editor della tua dashboard Supabase
-- =================================================================================

-- 1. Aggiorna la tabella subscriptions esistente
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS auto_synced BOOLEAN DEFAULT false;

ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS last_payment_date DATE;

-- 2. Crea la tabella per le connessioni bancarie
CREATE TABLE IF NOT EXISTS public.bank_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL, -- Es: 'MockBank', 'GoCardless', 'Plaid'
    account_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Policy di sicurezza per bank_connections
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Utenti gestiscono i propri account bancari." ON public.bank_connections
    FOR ALL USING (auth.uid() = user_id);

-- 3. Crea la tabella per il raw storico delle transazioni
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    bank_connection_id UUID REFERENCES public.bank_connections(id) ON DELETE CASCADE,
    amount DECIMAL NOT NULL,
    currency TEXT DEFAULT 'EUR',
    description TEXT NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Policy di sicurezza per transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Utenti gestiscono le proprie transazioni." ON public.transactions
    FOR ALL USING (auth.uid() = user_id);
