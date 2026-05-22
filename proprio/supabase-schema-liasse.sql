-- ════════════════════════════════════════════════════════════════
-- BailScan — Schema Liasse Fiscale LMNP
-- À ajouter au schema Supabase existant
-- ════════════════════════════════════════════════════════════════

-- ─── Table principale ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.liasses_fiscales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Période fiscale
  annee_fiscale INT NOT NULL,

  -- Type d'offre souscrite
  plan TEXT NOT NULL CHECK (plan IN ('auto_ia', 'premium')),
  prix_paye_eur NUMERIC NOT NULL,

  -- Paiement Stripe
  stripe_payment_id TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),

  -- Workflow
  status TEXT DEFAULT 'paid' CHECK (status IN (
    'paid',                   -- Paiement reçu, attente génération
    'generating',             -- IA en cours de génération
    'pending_user_validation',-- Auto IA : attente validation utilisateur
    'pending_expert_review',  -- Premium : attente revue expert-comptable
    'expert_revision_needed', -- Premium : expert demande modifs
    'validated_by_user',      -- Auto IA : utilisateur a validé
    'validated_by_expert',    -- Premium : expert a validé
    'transmitted',            -- EDI-TDFC envoyé à la DGFiP
    'arf_received',           -- ARF (Accusé Réception Fiscal) reçu
    'rejected',               -- DGFiP a rejeté
    'cancelled'               -- Annulé
  )),

  -- Données IA
  liasse_data JSONB,           -- Output complet de Claude
  ai_generated_at TIMESTAMPTZ,
  ai_model TEXT DEFAULT 'claude-opus-4-7',
  ai_alerts_count INT DEFAULT 0,
  ai_alerts JSONB DEFAULT '[]'::jsonb,

  -- Validation
  validated_by_user_at TIMESTAMPTZ,
  expert_reviewer_id UUID,        -- ID de l'expert-comptable partenaire
  expert_reviewed_at TIMESTAMPTZ,
  expert_notes TEXT,

  -- Télétransmission EDI
  edi_partner TEXT,                  -- 'edifiscale' | 'netdeclaration'
  edi_transmission_id TEXT,
  edi_tracking_url TEXT,
  transmitted_at TIMESTAMPTZ,

  -- Accusé de réception fiscal
  arf_received_at TIMESTAMPTZ,
  arf_number TEXT,
  arf_pdf_url TEXT,

  -- Bilan & déficit
  bilan_pdf_url TEXT,                -- PDF complet généré
  deficit_reportable NUMERIC DEFAULT 0,

  -- Synthèse rapide pour l'UI
  recettes_totales NUMERIC,
  charges_totales NUMERIC,
  amortissements NUMERIC,
  resultat_fiscal NUMERIC,
  ir_estime NUMERIC,
  economie_vs_micro_bic NUMERIC,

  -- Bailleur (snapshot au moment de la liasse)
  bailleur_nom TEXT,
  bailleur_siret TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Une seule liasse par année par utilisateur
  UNIQUE(user_id, annee_fiscale)
);

CREATE INDEX IF NOT EXISTS idx_liasses_user ON public.liasses_fiscales(user_id);
CREATE INDEX IF NOT EXISTS idx_liasses_status ON public.liasses_fiscales(status);
CREATE INDEX IF NOT EXISTS idx_liasses_expert_review ON public.liasses_fiscales(status)
  WHERE status = 'pending_expert_review';

ALTER TABLE public.liasses_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own liasses" ON public.liasses_fiscales
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own liasses" ON public.liasses_fiscales
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pas d'UPDATE/DELETE par l'utilisateur après transmission (audit trail)
CREATE POLICY "Users update own draft liasses" ON public.liasses_fiscales
  FOR UPDATE USING (
    auth.uid() = user_id AND
    status IN ('paid', 'generating', 'pending_user_validation', 'expert_revision_needed')
  );


-- ─── File des tâches pour les experts-comptables partenaires ───
CREATE TABLE IF NOT EXISTS public.expert_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liasse_id UUID NOT NULL REFERENCES public.liasses_fiscales(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'completed', 'requires_more_info')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to_expert_id UUID,
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expert_queue_pending ON public.expert_review_queue(status, priority, deadline)
  WHERE status IN ('pending', 'in_review');

ALTER TABLE public.expert_review_queue ENABLE ROW LEVEL SECURITY;
-- Pas de policy : seul le service role accède via Edge Functions


-- ─── Tables auxiliaires nécessaires ─────────────────────────────

-- Dépenses (factures, taxes, intérêts d'emprunt…)
CREATE TABLE IF NOT EXISTS public.depenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bien_id UUID REFERENCES public.biens(id),
  date DATE NOT NULL,
  description TEXT,
  montant NUMERIC NOT NULL,
  categorie TEXT CHECK (categorie IN (
    'taxe_fonciere', 'copropriete', 'assurance_pno', 'interets_emprunt',
    'frais_bancaires', 'gestion', 'travaux_entretien', 'travaux_immobilisables',
    'honoraires', 'diagnostics', 'mobilier', 'equipements', 'autres'
  )),
  amortissable BOOLEAN DEFAULT false,
  facture_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depenses_user_date ON public.depenses(user_id, date);
ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own depenses" ON public.depenses FOR ALL USING (auth.uid() = user_id);


-- Immobilisations (pour le calcul des amortissements)
CREATE TABLE IF NOT EXISTS public.immobilisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bien_id UUID NOT NULL REFERENCES public.biens(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL CHECK (categorie IN (
    'bati_gros_oeuvre', 'bati_toiture', 'bati_facade',
    'installations_techniques', 'agencements',
    'mobilier', 'electromenager', 'frais_acquisition'
  )),
  designation TEXT NOT NULL,
  valeur_origine NUMERIC NOT NULL,
  date_mise_service DATE NOT NULL,
  duree_annees NUMERIC NOT NULL,
  taux_amortissement NUMERIC NOT NULL,  -- ex. 0.0125 pour 1,25%/an
  amortissement_cumule NUMERIC DEFAULT 0,
  valeur_nette NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_immob_bien ON public.immobilisations(bien_id);
ALTER TABLE public.immobilisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own immob" ON public.immobilisations FOR ALL USING (auth.uid() = user_id);


-- Prélèvements réalisés (alimente la compta)
CREATE TABLE IF NOT EXISTS public.prelevements_realises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bail_id UUID REFERENCES public.baux(id),
  date_paiement DATE NOT NULL,
  mois_concerne TEXT,        -- ex. "2026-05"
  loyer_hc NUMERIC,
  charges NUMERIC,
  montant_total NUMERIC,
  statut TEXT CHECK (statut IN ('reussi', 'echec', 'rembourse')) DEFAULT 'reussi',
  motif_echec TEXT,
  iban_locataire_masked TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prelev_user_date ON public.prelevements_realises(user_id, date_paiement);
ALTER TABLE public.prelevements_realises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own prelevements" ON public.prelevements_realises FOR SELECT USING (auth.uid() = user_id);


-- Notifications in-app
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own notifs" ON public.notifications FOR ALL USING (auth.uid() = user_id);


-- Préférences notifications
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own prefs" ON public.notification_preferences FOR ALL USING (auth.uid() = user_id);


-- ─── Triggers de mise à jour automatique ────────────────────────

-- Met à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER liasses_updated_at BEFORE UPDATE ON public.liasses_fiscales
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER notif_prefs_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


-- ════════════════════════════════════════════════════════════════
-- FIN — Schema liasse fiscale
-- ════════════════════════════════════════════════════════════════
