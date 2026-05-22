// supabase/functions/generate-liasse-fiscale/index.ts
//
// Edge Function pour générer une liasse fiscale LMNP au régime réel
// via Claude API (claude-opus-4-7).
//
// Workflow :
//   1. Vérifie que l'utilisateur a payé (offre 'liasse_auto_ia' ou 'liasse_premium')
//   2. Récupère la comptabilité BailScan de l'année fiscale
//   3. Construit le prompt Claude avec les règles fiscales LMNP
//   4. Appelle Claude API avec un prompt structuré pour produire :
//      - Bilan comptable
//      - Compte de résultat
//      - Tableau des amortissements (par composante)
//      - Formulaires 2031 / 2033 A→G
//      - Annexe 2042-C-PRO
//      - FEC (Fichier des Écritures Comptables) au format normalisé
//   5. Sauvegarde dans Supabase Storage
//   6. Envoie à l'utilisateur pour validation
//   7. Si Premium : envoie aussi à l'expert-comptable partenaire pour vérif
//   8. Une fois validée, transmet au partenaire EDI (Edifiscale/NetDeclaration)
//
// Déploiement :
//   supabase functions deploy generate-liasse-fiscale
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-XXX

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════
// PROMPT SYSTÈME — Claude joue le rôle d'un fiscaliste LMNP rigoureux
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Tu es un fiscaliste expert spécialisé en location meublée non professionnelle (LMNP) au régime réel simplifié en France.

Tu produis des liasses fiscales conformes au Code Général des Impôts français, en suivant rigoureusement :

DOCTRINE APPLICABLE :
- Articles 50-0, 96, 102 ter, 151 sexies, 156 et 1649 quater B quater du CGI
- Bulletin officiel des Finances Publiques (BOFiP) BOI-BIC-CHAMP-40-20 (location meublée)
- BOI-BIC-DECLA-30-60-40 (obligations déclaratives)
- BOI-BIC-AMT (amortissements)

PRINCIPES COMPTABLES STRICTS :
1. Plan comptable général applicable au BIC
2. Comptabilité en partie double obligatoire
3. Amortissement par composantes pour le bâti :
   - Gros œuvre (structure) : 50 à 80 ans (1,25% à 2%/an)
   - Toiture : 25 ans (4%/an)
   - Façade : 30 ans (3,33%/an)
   - Installations techniques (électricité, plomberie, chauffage) : 20 ans (5%/an)
   - Agencements intérieurs : 15 ans (6,67%/an)
4. Amortissement du mobilier : 5 à 10 ans selon nature (mobilier 7 ans soit 14,29%/an, électroménager 5 ans soit 20%/an)
5. Frais de notaire : option entre amortissement linéaire (idem bâti) ou déduction en charge l'année d'acquisition
6. Le terrain (~15% du prix d'acquisition) n'est PAS amortissable

LIMITES & PRUDENCE :
- Vérifier l'éligibilité LMNP (recettes annuelles < 23 000 € ET < autres revenus du foyer)
- Si recettes > 23 000 € : passer au régime LMP (cotisations sociales TNS, formulaire spécifique)
- Détecter les anomalies (incohérences entre recettes / charges / dépenses immobilisables)
- Toujours appliquer le principe de prudence comptable
- Signaler clairement les zones d'incertitude qui nécessitent une validation humaine

FORMAT DE SORTIE :
Réponds UNIQUEMENT en JSON valide structuré selon le schéma demandé.
Aucun texte avant ou après le JSON. Pas de markdown.
Tous les montants en euros, sans symbole, avec 2 décimales si nécessaire.

PHILOSOPHIE :
Tu n'es pas un conseil fiscal. Tu es un outil de calcul qui applique mécaniquement les règles fiscales françaises. L'utilisateur final reste responsable de sa déclaration. Si une situation sort des cas standards (SCI, LMP, déficit reportable complexe, événements exceptionnels), tu DOIS le signaler dans le champ "alerts" pour orientation vers une vérification humaine.`;

// ═══════════════════════════════════════════════════════════════
// PROMPT UTILISATEUR — Construit dynamiquement
// ═══════════════════════════════════════════════════════════════

function buildUserPrompt(data: any): string {
  return `Génère la liasse fiscale LMNP au régime réel simplifié pour l'année ${data.annee_fiscale}.

═══ INFORMATIONS BAILLEUR ═══
Nom : ${data.bailleur.nom_complet}
SIRET : ${data.bailleur.siret || 'À créer'}
Adresse : ${data.bailleur.adresse_complete}
Date de début d'activité LMNP : ${data.bailleur.date_debut_lmnp}

═══ BIENS LMNP ═══
${data.biens.map((b: any, i: number) => `
Bien ${i + 1} : ${b.nom}
- Adresse : ${b.adresse}, ${b.code_postal} ${b.ville}
- Surface : ${b.surface} m²
- Date d'acquisition : ${b.date_acquisition}
- Prix d'acquisition (hors terrain estimé à 15%) : ${b.prix_acquisition} €
- Frais d'acquisition (notaire, agence) : ${b.frais_acquisition || 0} €
- Travaux d'amélioration capitalisés : ${b.travaux_capitalises || 0} €
- Mobilier initial : ${b.mobilier_initial || 0} €
- Date de mise en location : ${b.date_mise_location}
- Loyer mensuel HC : ${b.loyer_hc} €
- Charges récupérables : ${b.charges} €
`).join('\n')}

═══ COMPTABILITÉ ${data.annee_fiscale} ═══

RECETTES :
- Loyers encaissés HC : ${data.recettes.loyers_hc} €
- Charges récupérées : ${data.recettes.charges_recuperees} €
- TOTAL RECETTES : ${data.recettes.total} €

CHARGES DÉDUCTIBLES :
- Taxe foncière (hors part locataire) : ${data.charges.taxe_fonciere} €
- Charges de copropriété (non récupérables) : ${data.charges.copro_non_recup} €
- Assurance PNO : ${data.charges.assurance_pno} €
- Intérêts d'emprunt : ${data.charges.interets_emprunt} €
- Frais bancaires : ${data.charges.frais_bancaires} €
- Frais de gestion (BailScan, comptable) : ${data.charges.gestion} €
- Travaux d'entretien et réparation : ${data.charges.travaux_entretien} €
- Honoraires (huissier, avocat...) : ${data.charges.honoraires || 0} €
- Diagnostics obligatoires : ${data.charges.diagnostics || 0} €
- Autres charges : ${data.charges.autres || 0} €
- TOTAL CHARGES : ${data.charges.total} €

IMMOBILISATIONS À AMORTIR :
- Valeur du bâti à amortir (hors terrain) : ${data.immobilisations.bati} €
- Mobilier (initial + ajouts) : ${data.immobilisations.mobilier} €
- Équipements (électroménager) : ${data.immobilisations.equipements} €

DÉFICITS REPORTABLES (années antérieures) :
${data.deficits_reportables.length > 0 ?
  data.deficits_reportables.map((d: any) => `- ${d.annee} : ${d.montant} €`).join('\n')
  : '- Aucun'}

═══ SORTIE ATTENDUE ═══

Produis un objet JSON avec EXACTEMENT cette structure :

{
  "metadata": {
    "annee_fiscale": "${data.annee_fiscale}",
    "regime": "LMNP réel simplifié",
    "formulaires": ["2031-SD", "2033-A", "2033-B", "2033-C", "2033-D", "2033-E", "2033-F", "2033-G", "2042-C-PRO"],
    "generated_at": "ISO datetime",
    "generated_by": "BailScan IA v1.0"
  },
  "alerts": [
    {
      "level": "info|warning|critical",
      "title": "Titre court",
      "description": "Description détaillée de l'alerte ou point d'attention",
      "requires_human_review": true|false
    }
  ],
  "bilan_comptable": {
    "actif_immobilise": {
      "immobilisations_corporelles_brut": 0,
      "amortissements_cumules": 0,
      "valeur_nette": 0
    },
    "actif_circulant": {
      "creances": 0,
      "disponibilites": 0
    },
    "passif": {
      "capitaux_propres": 0,
      "resultat_exercice": 0,
      "dettes": 0
    }
  },
  "compte_de_resultat": {
    "produits_exploitation": {
      "loyers": 0,
      "charges_recuperees": 0,
      "total": 0
    },
    "charges_exploitation": {
      "achats": 0,
      "services_exterieurs": 0,
      "impots_taxes": 0,
      "amortissements": 0,
      "autres": 0,
      "total": 0
    },
    "resultat_exploitation": 0,
    "produits_financiers": 0,
    "charges_financieres": 0,
    "resultat_net": 0
  },
  "tableau_amortissements": [
    {
      "designation": "Bâti - Gros œuvre - [Adresse]",
      "valeur_origine": 0,
      "date_mise_service": "YYYY-MM-DD",
      "duree_annees": 0,
      "taux": 0,
      "amortissement_anterieur": 0,
      "dotation_exercice": 0,
      "amortissement_cumule": 0,
      "valeur_nette": 0
    }
  ],
  "tableau_immobilisations": [
    {
      "categorie": "Bâti|Mobilier|Equipements",
      "designation": "string",
      "valeur_brut": 0,
      "amortissements": 0,
      "valeur_nette": 0
    }
  ],
  "formulaire_2031": {
    "regime_imposition": "réel simplifié",
    "resultat_comptable": 0,
    "reintegrations": [],
    "deductions": [],
    "resultat_fiscal": 0,
    "deficits_anterieurs_imputes": 0,
    "resultat_apres_imputation": 0
  },
  "formulaire_2033_A_bilan_simplifie": { /* ... */ },
  "formulaire_2033_B_compte_resultat": { /* ... */ },
  "formulaire_2033_C_immobilisations_amortissements": { /* ... */ },
  "formulaire_2033_D_provisions": { /* ... */ },
  "formulaire_2033_E_VAS_valeur_ajoutee": { /* ... */ },
  "formulaire_2033_F_composition_capital": { /* ... */ },
  "formulaire_2033_G_filiales": { /* ... */ },
  "annexe_2042_C_PRO": {
    "case_5ND": 0,
    "case_5NG_revenus_bic_non_pro_realiste": 0,
    "case_5NJ_deficits_non_pro": 0,
    "commentaires": ""
  },
  "FEC_summary": {
    "nb_ecritures": 0,
    "total_debit": 0,
    "total_credit": 0,
    "equilibre": true,
    "journal_uniques": ["AC", "BQ", "OD", "VE"]
  },
  "synthese_fiscale": {
    "resultat_avant_amortissements": 0,
    "total_amortissements_exercice": 0,
    "resultat_fiscal_imposable": 0,
    "tmi_estimee": 0,
    "ir_estime": 0,
    "prelevements_sociaux_172": 0,
    "total_a_payer": 0,
    "economie_vs_micro_bic": 0
  },
  "recommandations_pour_an_prochain": [
    {
      "categorie": "string",
      "recommandation": "string",
      "impact_estime_eur": 0
    }
  ]
}

Calcule TOUS les montants. Sois rigoureux. Si une donnée manque, mets 0 et ajoute une alerte.
Si la situation comporte un risque d'erreur (cas complexe), ajoute une alerte "requires_human_review": true.`;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ─── 1. Auth ───
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { annee_fiscale } = await req.json();

    // ─── 2. Vérifie qu'une liasse a été payée pour cette année ───
    const { data: liasse } = await supabase
      .from('liasses_fiscales')
      .select('*')
      .eq('user_id', user.id)
      .eq('annee_fiscale', annee_fiscale)
      .single();

    if (!liasse || liasse.payment_status !== 'paid') {
      return new Response(JSON.stringify({
        error: 'Aucune liasse payée pour cette année',
        action: 'subscribe',
      }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── 3. Récupère la comptabilité de l'année ───
    const compta = await fetchComptabilite(supabase, user.id, annee_fiscale);

    // ─── 4. Appel Claude API ───
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
    });

    const userPrompt = buildUserPrompt(compta);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      temperature: 0.1, // Bas pour précision fiscale
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extraction du JSON de la réponse Claude
    const responseText = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    let liasseData: any;
    try {
      liasseData = JSON.parse(responseText);
    } catch (e) {
      // Fallback : essaie d'extraire un JSON du texte
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Claude n\'a pas produit de JSON valide');
      }
      liasseData = JSON.parse(jsonMatch[0]);
    }

    // ─── 5. Sauvegarde dans la DB ───
    await supabase
      .from('liasses_fiscales')
      .update({
        liasse_data: liasseData,
        status: liasse.plan === 'premium' ? 'pending_expert_review' : 'pending_user_validation',
        ai_generated_at: new Date().toISOString(),
      })
      .eq('id', liasse.id);

    // ─── 6. Si Premium, notifie l'expert-comptable partenaire ───
    if (liasse.plan === 'premium') {
      await notifyExpertComptable(supabase, liasse.id, user.id);
    }

    return new Response(JSON.stringify({
      success: true,
      liasse_id: liasse.id,
      requires_review: liasse.plan === 'premium',
      alerts_count: (liasseData.alerts || []).length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Erreur génération liasse:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function fetchComptabilite(supabase: any, userId: string, anneeFiscale: number) {
  // Récupère le profil bailleur
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Récupère les biens
  const { data: biens } = await supabase
    .from('biens')
    .select('*, immobilisations(*)')
    .eq('user_id', userId);

  // Récupère les loyers encaissés sur l'année
  const startDate = `${anneeFiscale}-01-01`;
  const endDate = `${anneeFiscale}-12-31`;

  const { data: paiements } = await supabase
    .from('prelevements_realises')
    .select('*')
    .eq('user_id', userId)
    .gte('date_paiement', startDate)
    .lte('date_paiement', endDate);

  const { data: depenses } = await supabase
    .from('depenses')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate);

  // Récupère les déficits reportables des années antérieures
  const { data: deficitsAnt } = await supabase
    .from('liasses_fiscales')
    .select('annee_fiscale, deficit_reportable')
    .eq('user_id', userId)
    .gt('deficit_reportable', 0)
    .lt('annee_fiscale', anneeFiscale)
    .order('annee_fiscale', { ascending: true });

  // Agrège tout
  const loyers_hc = paiements?.reduce((s: number, p: any) => s + (p.loyer_hc || 0), 0) || 0;
  const charges_recuperees = paiements?.reduce((s: number, p: any) => s + (p.charges || 0), 0) || 0;

  // Catégorisation des dépenses par poste comptable
  const cat = (key: string) => depenses?.filter((d: any) => d.categorie === key).reduce((s: number, d: any) => s + d.montant, 0) || 0;

  return {
    annee_fiscale: anneeFiscale,
    bailleur: {
      nom_complet: `${profile.prenom || ''} ${profile.nom || ''}`.trim(),
      siret: profile.siret,
      adresse_complete: profile.adresse_complete,
      date_debut_lmnp: profile.date_debut_lmnp,
    },
    biens: biens || [],
    recettes: {
      loyers_hc,
      charges_recuperees,
      total: loyers_hc + charges_recuperees,
    },
    charges: {
      taxe_fonciere: cat('taxe_fonciere'),
      copro_non_recup: cat('copropriete'),
      assurance_pno: cat('assurance_pno'),
      interets_emprunt: cat('interets_emprunt'),
      frais_bancaires: cat('frais_bancaires'),
      gestion: cat('gestion'),
      travaux_entretien: cat('travaux_entretien'),
      honoraires: cat('honoraires'),
      diagnostics: cat('diagnostics'),
      autres: cat('autres'),
      total: depenses?.reduce((s: number, d: any) => s + d.montant, 0) || 0,
    },
    immobilisations: {
      bati: biens?.reduce((s: number, b: any) => s + (b.valeur_bati || 0), 0) || 0,
      mobilier: biens?.reduce((s: number, b: any) => s + (b.valeur_mobilier || 0), 0) || 0,
      equipements: biens?.reduce((s: number, b: any) => s + (b.valeur_equipements || 0), 0) || 0,
    },
    deficits_reportables: (deficitsAnt || []).map((d: any) => ({
      annee: d.annee_fiscale,
      montant: d.deficit_reportable,
    })),
  };
}

async function notifyExpertComptable(supabase: any, liasseId: string, userId: string) {
  // Crée une tâche dans la file des experts-comptables partenaires
  await supabase.from('expert_review_queue').insert({
    liasse_id: liasseId,
    user_id: userId,
    status: 'pending',
    priority: 'normal',
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // J+14
  });

  // TODO : Envoyer email via Resend au cabinet partenaire avec lien sécurisé
}
