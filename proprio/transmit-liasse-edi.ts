// supabase/functions/transmit-liasse-edi/index.ts
//
// Edge Function pour télétransmettre une liasse fiscale validée
// via notre partenaire EDI agréé DGFiP.
//
// Partenaires EDI possibles :
// - Edifiscale (https://edifiscale.com) — API REST moderne
// - NetDeclaration (https://www.netdeclaration.net) — service complet
// - ASPOne.fr (https://www.aspone.fr) — alternative
//
// Workflow :
//   1. Vérifie que la liasse est en statut 'validated_by_user' (ou 'validated_by_expert' pour Premium)
//   2. Convertit le JSON liasse en format EDI-TDFC normalisé
//   3. Appelle l'API du partenaire EDI pour télétransmission
//   4. Récupère l'ARF (Accusé de Réception Fiscal) DGFiP
//   5. Marque la liasse comme 'transmitted' avec l'ARF
//   6. Envoie un email de confirmation à l'utilisateur

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════
// CONFIG PARTENAIRE EDI
// ═══════════════════════════════════════════════════════════════

const EDI_PARTNER = Deno.env.get('EDI_PARTNER') || 'edifiscale';
const EDI_API_KEY = Deno.env.get('EDI_API_KEY')!;
const EDI_API_URL = {
  edifiscale: 'https://api.edifiscale.com/v1',
  netdeclaration: 'https://api.netdeclaration.net/v2',
}[EDI_PARTNER];

// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // service role pour bypass RLS
    );

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { liasse_id } = await req.json();

    // ─── 1. Récupère la liasse ───
    const { data: liasse } = await supabase
      .from('liasses_fiscales')
      .select('*')
      .eq('id', liasse_id)
      .eq('user_id', user.id)
      .single();

    if (!liasse) {
      return new Response(JSON.stringify({ error: 'Liasse introuvable' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── 2. Vérifie le statut ───
    const requiredStatus = liasse.plan === 'premium' ? 'validated_by_expert' : 'validated_by_user';
    if (liasse.status !== requiredStatus) {
      return new Response(JSON.stringify({
        error: `La liasse doit être en statut '${requiredStatus}' avant transmission`,
        current_status: liasse.status,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── 3. Convertit le JSON en format EDI-TDFC ───
    const ediXml = convertToEdiTdfc(liasse.liasse_data, liasse);

    // ─── 4. Récupère le profil utilisateur ───
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // ─── 5. Appelle l'API du partenaire EDI ───
    const ediResponse = await fetch(`${EDI_API_URL}/transmissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EDI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client: {
          name: `${profile.prenom} ${profile.nom}`,
          siret: profile.siret,
          email: profile.email,
        },
        annee_fiscale: liasse.annee_fiscale,
        type_declaration: 'liasse_lmnp_reel_simplifie',
        formulaires: ['2031-SD', '2033-A', '2033-B', '2033-C', '2033-D', '2033-E', '2033-F', '2033-G'],
        format: 'EDI-TDFC',
        edi_payload: ediXml,
        callback_url: `${Deno.env.get('APP_URL')}/api/edi-webhook`,
      }),
    });

    if (!ediResponse.ok) {
      const errorBody = await ediResponse.text();
      throw new Error(`EDI partner error: ${ediResponse.status} - ${errorBody}`);
    }

    const ediResult = await ediResponse.json();
    // Réponse type :
    // {
    //   "transmission_id": "EDIF-2026-12345",
    //   "status": "submitted",
    //   "estimated_arf_delay_hours": 48,
    //   "tracking_url": "https://app.edifiscale.com/track/..."
    // }

    // ─── 6. Met à jour la liasse ───
    await supabase
      .from('liasses_fiscales')
      .update({
        status: 'transmitted',
        edi_transmission_id: ediResult.transmission_id,
        edi_partner: EDI_PARTNER,
        edi_tracking_url: ediResult.tracking_url,
        transmitted_at: new Date().toISOString(),
      })
      .eq('id', liasse_id);

    // ─── 7. Crée une notification pour l'utilisateur ───
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'liasse_transmise',
      title: `Liasse fiscale ${liasse.annee_fiscale} transmise à la DGFiP`,
      description: `Transmission EDI-TDFC en cours. Vous recevrez l'accusé de réception (ARF) sous 48h.`,
      data: { liasse_id, transmission_id: ediResult.transmission_id },
    });

    // TODO : envoyer email transactionnel via Resend

    return new Response(JSON.stringify({
      success: true,
      transmission_id: ediResult.transmission_id,
      status: 'transmitted',
      tracking_url: ediResult.tracking_url,
      estimated_arf_delay_hours: ediResult.estimated_arf_delay_hours || 48,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Erreur transmission EDI:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// CONVERSION JSON → EDI-TDFC XML
// ═══════════════════════════════════════════════════════════════

/**
 * Convertit le JSON liasse produit par Claude en format EDI-TDFC.
 *
 * Le format EDI-TDFC suit la norme EDIFICAS (https://www.edificas.fr).
 * Il s'agit d'un XML structuré avec des balises spécifiques pour chaque
 * formulaire (2031, 2033A, 2033B, etc.).
 *
 * Pour la production, on délègue cette conversion au partenaire EDI
 * (Edifiscale a une API qui accepte le JSON et fait la conversion).
 *
 * Pour la production directe (futur), il faudra implémenter le mapping
 * complet selon les spécifications BOFIP du Cahier des Charges TDFC.
 */
function convertToEdiTdfc(liasseData: any, liasse: any): string {
  // Pour l'instant, on envoie le JSON tel quel ; le partenaire EDI fait la conversion.
  // Edifiscale accepte le JSON directement et génère le XML EDI conforme.
  return JSON.stringify({
    SIRET: liasse.bailleur_siret,
    EXERCICE_FISCAL: liasse.annee_fiscale,
    FORMULAIRES: liasseData,
    REGIME: 'BIC_REEL_SIMPLIFIE',
    ACTIVITE: 'LOCATION_MEUBLEE_NON_PROFESSIONNELLE',
  });
}
