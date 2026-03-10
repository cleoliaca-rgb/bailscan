// ═══════════════════════════════════════════════════════════════
// BailScan — API analyze.js v2
// Gère : bail · état des lieux · encadrement loyers · lettres
// ═══════════════════════════════════════════════════════════════

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const VILLES_ENCADREMENT = [
  "paris", "lyon", "villeurbanne", "bordeaux", "montpellier",
  "grenoble", "lille", "roubaix", "tourcoing", "hellemmes",
  "lomme", "saint-denis", "montreuil", "vincennes", "boulogne-billancourt",
  "nanterre", "creteil", "ivry-sur-seine", "bagnolet", "aubervilliers",
  "pantin", "bobigny", "stains", "saint-ouen"
];

function isVilleEncadree(ville) {
  if (!ville) return false;
  return VILLES_ENCADREMENT.some(v => ville.toLowerCase().includes(v));
}

function buildSystemPrompt(context) {
  const type = context?.type_analyse || 'bail';
  const ville = context?.ville || '';
  const surface = context?.surface ? `${context.surface} m²` : 'non précisée';
  const bienType = context?.type_bien === 'meuble' ? 'meublé' : 'vide';
  const locType = context?.type_location === 'colocation' ? 'colocation' : 'location individuelle';
  const loyerBase = context?.loyer_base ? `${context.loyer_base} €/mois` : 'non précisé';
  const depot = context?.depot ? `${context.depot} €` : 'non précisé';
  const encadre = isVilleEncadree(ville);

  return `Tu es BailScan, expert juridique spécialisé en droit locatif français.
Tu maîtrises : loi du 6 juillet 1989, loi ALUR (2014), loi ELAN (2018), décret 26 août 1987 (réparations locatives), décret 87-713 (charges récupérables), jurisprudence locative française.

Contexte du logement :
- Type d'analyse : ${type === 'etat' ? 'État des lieux' : 'Bail locatif'}
- Type de location : ${locType}
- Type de bien : ${bienType}
- Ville : ${ville || 'non précisée'}${encadre ? ' [ZONE ENCADREMENT LOYERS]' : ''}
- Surface : ${surface}
- Loyer de base déclaré : ${loyerBase}
- Dépôt de garantie déclaré : ${depot}

RÈGLES :
1. Références légales exactes obligatoires
2. JSON valide uniquement, sans markdown
3. Sois concis`;
}

function buildBailPrompt(context) {
  const depot = context?.depot || 0;
  const bienType = context?.type_bien === 'meuble' ? 'meublé' : 'vide';
  const depotMax = bienType === 'meuble' ? 2 : 1;
  const ville = context?.ville || '';
  const surface = context?.surface || null;
  const loyerBase = context?.loyer_base || null;
  const encadre = isVilleEncadree(ville);

  let extra = '';
  if (encadre && loyerBase && surface) {
    extra += `\nATTENTION : ${ville} est en zone d'encadrement des loyers. Loyer déclaré : ${loyerBase}€/mois pour ${surface}m². Vérifie la cohérence avec les plafonds légaux.`;
  }
  if (depot > 0) {
    extra += `\nDépôt de garantie déclaré : ${depot}€. Maximum légal pour un logement ${bienType} : ${depotMax} mois de loyer hors charges. Vérifie.`;
  }

  return `Analyse ce bail locatif français.${extra}

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, sans balises markdown.

Exemple de format attendu :
{"score":75,"verdict":"Risque","verdict_titre":"2 clauses à corriger","resume":"Résumé court.","loyer":{"statut":"ok","analyse":"Non concerné par l'encadrement.","plafond":null,"trop_percu":null},"clauses_abusives":[{"type":"danger","titre":"Titre clause","description":"Description.","explication_juridique":"Explication légale.","base_legale":["Art. X loi 1989"],"action":"Action recommandée."}],"plan_action":["Étape 1","Étape 2","Étape 3"]}

Analyse 3 à 5 clauses réelles du document. JSON strict uniquement.`;

function buildEtatDesLieuxPrompt(context) {
  const depot = context?.depot || 0;
  return `Analyse cet état des lieux (entrée et/ou sortie) d'un logement locatif français.
${depot > 0 ? `Dépôt de garantie versé : ${depot}€. Identifie les retenues potentiellement abusives.` : ''}

Retourne UNIQUEMENT ce JSON :

{
  "score": <0-100, 100=très favorable au locataire>,
  "verdict": "<Equitable|Risque|Abusif>",
  "verdict_titre": "<titre court>",
  "resume": "<2-3 phrases résumant la situation>",
  "loyer": null,
  "clauses_abusives": [
    {
      "type": "<danger|warning|ok>",
      "titre": "<élément ex: 'Retenue pour peinture jaunie'>",
      "description": "<description>",
      "explication_juridique": "<usure normale vs dégradation, grille de vétusté, durées légales>",
      "base_legale": ["<référence>"],
      "action": "<action recommandée>"
    }
  ],
  "plan_action": ["<étape 1>", "<étape 2>", "<étape 3>"]
}

Distingue usure normale (propriétaire) et dégradations réelles (locataire). Mentionne la grille de vétusté.`;
}

function buildLetterPrompt(letterType, analysisData, context) {
  const labels = {
    proprio: 'au propriétaire pour demander la suppression des clauses illégales',
    agence: "à l'agence immobilière gestionnaire pour signaler les clauses illégales",
    miseendemeure: 'de mise en demeure formelle avant saisine de la conciliation',
    remboursement: 'de demande de remboursement du trop-perçu de loyer (encadrement non respecté)',
    conciliation: 'de saisine de la Commission Départementale de Conciliation'
  };
  const illegalClauses = (analysisData?.clauses_abusives || [])
    .filter(c => c.type === 'danger')
    .map(c => `- ${c.titre} (${(c.base_legale || []).join(', ')})`)
    .join('\n') || 'Voir rapport complet';

  return `Rédige une lettre officielle ${labels[letterType] || letterType}.

Contexte du dossier :
- Score du bail : ${analysisData?.score}/100
- Ville : ${context?.ville || 'non précisée'}
- Loyer : ${context?.loyer_base || 'non précisé'} €/mois
- Surface : ${context?.surface || 'non précisée'} m²

Clauses illégales détectées :
${illegalClauses}

Exigences :
- Lettre LRAR complète et professionnelle
- Références légales exactes (loi 6 juillet 1989, ALUR, ELAN)
- Ton ferme mais courtois
- Mentionner les recours si non-réponse sous 15 jours
- Format complet : coordonnées expéditeur, destinataire, date, objet, corps, formule de politesse, signature
- Les champs à personnaliser entre [crochets]

Retourne la lettre en texte brut, prête à être copiée.`;
}

async function callAnthropic(messages, systemPrompt, maxTokens = 1500) {
  const response = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }
  return response.json();
}

// Config Vercel : augmenter la limite du body à 10MB pour les PDFs
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Augmenter la limite body pour Vercel (doit aussi être dans vercel.json)
  res.setHeader('Content-Type', 'application/json');

  try {
    const body = req.body;

    // Vérifier que le body est bien parsé (protection contre les erreurs 413)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Corps de requête invalide. Si vous avez uploadé un PDF, essayez de coller le texte directement.' });
    }

    const context = body.context || {};

    // ── LETTRES ─────────────────────────────────────────────────
    if (body.letter_mode) {
      const systemPrompt = buildSystemPrompt(context);
      const prompt = buildLetterPrompt(body.letter_type, body.analysis_data, context);
      const data = await callAnthropic(
        [{ role: "user", content: prompt }],
        systemPrompt, 1500
      );
      return res.status(200).json({ letter: data.content?.[0]?.text || '' });
    }

    // ── ANALYSE ──────────────────────────────────────────────────
    const type = context.type_analyse || 'bail';
    const systemPrompt = buildSystemPrompt(context);
    const analysisPrompt = type === 'etat'
      ? buildEtatDesLieuxPrompt(context)
      : buildBailPrompt(context);

    // Construction du message
    let userContent;
    if (body.pdf) {
      const sizeKB = (body.pdf.length * 0.75) / 1024;
      if (sizeKB > 4000) return res.status(400).json({ error: 'PDF trop volumineux. Colle le texte directement.' });
      userContent = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: body.pdf } },
        { type: "text", text: analysisPrompt }
      ];
    } else if (body.text) {
      userContent = analysisPrompt + "\n\n---\nDOCUMENT À ANALYSER :\n\n" + body.text;
    } else {
      return res.status(400).json({ error: 'Aucun document fourni.' });
    }

    const data = await callAnthropic(
      [{ role: "user", content: userContent }],
      systemPrompt, 1800
    );

    // Parse JSON
    const rawText = data.content?.[0]?.text || '';
    let parsed;
    try {
      // Nettoyage : extraire uniquement le JSON entre { et }
      let clean = rawText;
      clean = clean.replace(/```json/g, '').replace(/```/g, '');
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
      clean = clean.trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('JSON parse error:', rawText.slice(0, 500));
      return res.status(200).json({
        score: 50, verdict: 'Risque',
        verdict_titre: 'Analyse partielle — réessayez en collant le texte',
        resume: "L'analyse a rencontré un problème de formatage. Essayez de coller le texte de votre bail manuellement dans l'onglet "Coller le texte".",
        loyer: null, clauses_abusives: [],
        plan_action: ['Réessayer en collant le texte du bail dans le champ texte']
      });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('BailScan error:', error);
    return res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
}
