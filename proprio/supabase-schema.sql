-- ════════════════════════════════════════════════════════════════
-- BailScan Propriétaire — Schema Supabase complet
-- À exécuter dans l'éditeur SQL de Supabase :
-- https://supabase.com/dashboard/project/<projet>/sql/new
-- ════════════════════════════════════════════════════════════════

-- ─── 1. TABLE PROFILES ──────────────────────────────────────────
-- Étend auth.users avec les infos métier
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  prenom TEXT,
  nom TEXT,
  plan TEXT NOT NULL DEFAULT 'gratuit' CHECK (plan IN ('gratuit', 'essentiel', 'premium')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  plan_started_at TIMESTAMPTZ,
  plan_renew_at TIMESTAMPTZ,
  plan_cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, prenom, nom, plan)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'prenom',
    NEW.raw_user_meta_data->>'nom',
    COALESCE(NEW.raw_user_meta_data->>'plan', 'gratuit')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ─── 2. TABLE USAGE_COUNTERS ────────────────────────────────────
-- Compteurs mensuels d'usage des features (analyses, courriers IA…)
CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,  -- ex. "2026-05"
  analyses_bail INT DEFAULT 0,
  analyses_dossier INT DEFAULT 0,
  courriers_ia INT DEFAULT 0,
  questions_juridique INT DEFAULT 0,
  prelevements INT DEFAULT 0,
  baux_generes INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON public.usage_counters
  FOR SELECT USING (auth.uid() = user_id);

-- Fonction RPC pour incrémenter de manière atomique
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_month TEXT,
  p_feature TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.usage_counters (user_id, month)
  VALUES (p_user_id, p_month)
  ON CONFLICT (user_id, month) DO NOTHING;

  EXECUTE format(
    'UPDATE public.usage_counters SET %I = %I + 1, updated_at = NOW() WHERE user_id = $1 AND month = $2',
    p_feature, p_feature
  ) USING p_user_id, p_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. TABLE BIENS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.biens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  type_location TEXT CHECK (type_location IN ('vide', 'meuble', 'mobilite', 'etudiant')),
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  surface NUMERIC,
  pieces INT,
  etage TEXT,
  dpe TEXT,
  ges TEXT,
  loyer_hc NUMERIC,
  charges NUMERIC,
  depot_garantie NUMERIC,
  copropriete BOOLEAN DEFAULT false,
  syndic TEXT,
  identifiant_fiscal TEXT,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.biens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own biens" ON public.biens FOR ALL USING (auth.uid() = user_id);


-- ─── 4. TABLE LOCATAIRES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locataires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bien_id UUID REFERENCES public.biens(id) ON DELETE SET NULL,
  prenom TEXT,
  nom TEXT,
  email TEXT,
  telephone TEXT,
  date_naissance DATE,
  situation TEXT,  -- 'cdi', 'cdd', 'etudiant', 'retraite', etc.
  revenu_mensuel NUMERIC,
  statut TEXT CHECK (statut IN ('candidat', 'actif', 'ancien')) DEFAULT 'candidat',
  score_ia INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.locataires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own locataires" ON public.locataires FOR ALL USING (auth.uid() = user_id);


-- ─── 5. TABLE BAUX ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.baux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bien_id UUID REFERENCES public.biens(id),
  locataire_id UUID REFERENCES public.locataires(id),
  type_bail TEXT,  -- 'vide_3ans', 'meuble_1an', 'mobilite', 'etudiant_9mois'
  date_signature DATE,
  date_entree DATE,
  date_fin DATE,
  loyer_hc NUMERIC,
  charges NUMERIC,
  depot_garantie NUMERIC,
  irl_reference TEXT,
  statut TEXT CHECK (statut IN ('brouillon', 'envoye', 'signe', 'expire', 'resilié')) DEFAULT 'brouillon',
  pdf_url TEXT,
  paid BOOLEAN DEFAULT false,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.baux ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own baux" ON public.baux FOR ALL USING (auth.uid() = user_id);


-- ─── 6. TABLE PRELEVEMENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prelevements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bail_id UUID REFERENCES public.baux(id),
  mandat_sepa_id TEXT,
  iban_locataire_masked TEXT,
  jour_prelevement INT CHECK (jour_prelevement BETWEEN 1 AND 28),
  montant NUMERIC,
  actif BOOLEAN DEFAULT true,
  gocardless_mandate_id TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.prelevements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own prelevements" ON public.prelevements FOR ALL USING (auth.uid() = user_id);


-- ─── 7. TABLE DOCUMENTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bien_id UUID REFERENCES public.biens(id) ON DELETE SET NULL,
  type_doc TEXT,  -- 'bail', 'quittance', 'edl', 'dpe', 'courrier', 'facture', 'fiscalite'
  nom TEXT,
  storage_path TEXT,  -- ex. "user_id/biens/abc/bail.pdf"
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own documents" ON public.documents FOR ALL USING (auth.uid() = user_id);


-- ─── 8. TABLE STRIPE_EVENTS (idempotence webhook) ───────────────
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id TEXT PRIMARY KEY,  -- Stripe event ID
  type TEXT NOT NULL,
  data JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─── 9. STORAGE BUCKET ──────────────────────────────────────────
-- À créer manuellement dans l'UI Supabase (Storage → New bucket)
-- Nom : "documents-prives"
-- Public : NON
-- File size limit : 50 MB
-- Allowed MIME types : application/pdf, image/*, application/msword,
--                      application/vnd.openxmlformats-officedocument.*

-- Policy pour le bucket documents-prives :
-- SELECT/INSERT/DELETE seulement si auth.uid() = (storage.foldername(name))[1]


-- ─── 10. CHECK CONTRAINTE BIENS_MAX EN PLAN GRATUIT ─────────────
-- Empêche la création d'un 2e bien en plan gratuit
CREATE OR REPLACE FUNCTION public.check_biens_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan TEXT;
  v_count INT;
BEGIN
  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;

  IF v_plan = 'gratuit' THEN
    SELECT COUNT(*) INTO v_count
      FROM public.biens
      WHERE user_id = NEW.user_id AND archived = false;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'Le plan gratuit est limité à 1 bien. Passez à l''Essentiel pour des biens illimités.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_biens_limit
  BEFORE INSERT ON public.biens
  FOR EACH ROW EXECUTE PROCEDURE public.check_biens_limit();


-- ─── 11. INDEX UTILES ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_biens_user ON public.biens(user_id) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_locataires_user ON public.locataires(user_id);
CREATE INDEX IF NOT EXISTS idx_locataires_bien ON public.locataires(bien_id);
CREATE INDEX IF NOT EXISTS idx_baux_user ON public.baux(user_id);
CREATE INDEX IF NOT EXISTS idx_prelevements_actifs ON public.prelevements(user_id, actif) WHERE actif = true;
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe ON public.profiles(stripe_customer_id);


-- ════════════════════════════════════════════════════════════════
-- FIN — Schema prêt
-- ════════════════════════════════════════════════════════════════
