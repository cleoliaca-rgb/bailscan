// BailScan — API analyze.js
// CommonJS pur — compatible Vercel sans type:module

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
  return VILLES_ENCADREMENT.some(function(v) { return ville.toLowerCase().includes(v); });
}

function buildSystemPrompt(context) {
  var type = (context && context.type_analyse) || 'bail';
  var ville = (context && context.ville) || '';
  var surface = (context && context.surface) ? context.surface + ' m2' : 'non precisee';
  var bienType = (context && context.type_bien === 'meuble') ? 'meuble' : 'vide';
  var locType = (context && context.type_location === 'colocation') ? 'colocation' : 'location individuelle';
  var loyerBase = (context && context.loyer_base) ? context.loyer_base + ' euros/mois' : 'non precise';
  var depot = (context && context.depot) ? context.depot + ' euros' : 'non precise';
  var encadre = isVilleEncadree(ville);

  return "Tu es BailScan, expert juridique en droit locatif francais.\n"
    + "Tu maitrises : loi du 6 juillet 1989, loi ALUR (2014), loi ELAN (2018), decret 87-713.\n\n"
    + "Contexte :\n"
    + "- Type d'analyse : " + (type === 'etat' ? 'Etat des lieux' : 'Bail locatif') + "\n"
    + "- Type de location : " + locType + "\n"
    + "- Type de bien : " + bienType + "\n"
    + "- Ville : " + (ville || 'non precisee') + (encadre ? ' [ZONE ENCADREMENT LOYERS]' : '') + "\n"
    + "- Surface : " + surface + "\n"
    + "- Loyer declare : " + loyerBase + "\n"
    + "- Depot de garantie : " + depot + "\n\n"
    + "Reponds TOUJOURS en JSON valide uniquement. Jamais de markdown. Jamais de backticks.";
}

function buildBailPrompt(context) {
  var depot = (context && context.depot) || 0;
  var bienType = (context && context.type_bien === 'meuble') ? 'meuble' : 'vide';
  var depotMax = bienType === 'meuble' ? 2 : 1;
  var ville = (context && context.ville) || '';
  var surface = (context && context.surface) || null;
  var loyerBase = (context && context.loyer_base) || null;
  var encadre = isVilleEncadree(ville);

  var extra = '';
  if (encadre && loyerBase && surface) {
    extra += "\nATTENTION : " + ville + " est en zone d'encadrement des loyers. Loyer declare : " + loyerBase + " euros/mois pour " + surface + "m2. Verifie la coherence avec les plafonds legaux.";
  }
  if (depot > 0) {
    extra += "\nDepot de garantie declare : " + depot + " euros. Maximum legal pour un logement " + bienType + " : " + depotMax + " mois de loyer hors charges. Verifie.";
  }

  var justif = (context && context.complement_justif) || '';
  if (justif) {
    extra += "\nJustification du complement de loyer mentionnee dans le bail : \"" + justif + "\". Evalue si cette justification est legalement valable (caracteristiques exceptionnelles de localisation ou confort selon Art. 17-2 loi 1989).";
  } else if (context && context.complement_loyer > 0) {
    extra += "\nComplément de loyer de " + context.complement_loyer + " euros present dans le bail SANS justification fournie. Verifie si c'est un probleme.";
  }

  return "Analyse ce bail locatif francais." + extra + "\n\n"
    + "Reponds UNIQUEMENT avec un JSON valide, sans texte avant ni apres, sans backticks, sans markdown.\n"
    + "Format exact attendu :\n"
    + "{\"score\":75,\"verdict\":\"Risque\",\"verdict_titre\":\"2 clauses a corriger\",\"resume\":\"Resume.\",\"loyer\":{\"statut\":\"ok\",\"analyse\":\"Analyse.\",\"plafond\":null,\"trop_percu\":null},\"clauses_abusives\":[{\"type\":\"danger\",\"titre\":\"Titre\",\"description\":\"Description.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. X loi 1989\"],\"action\":\"Action.\"}],\"plan_action\":[\"Etape 1\",\"Etape 2\",\"Etape 3\"]}\n\n"
    + "Analyse 3 a 5 clauses reelles du document. JSON pur uniquement.";
}

function buildEtatDesLieuxPrompt(context) {
  var depot = (context && context.depot) || 0;
  return "Analyse cet etat des lieux d'un logement locatif francais.\n"
    + (depot > 0 ? "Depot de garantie verse : " + depot + " euros. Identifie les retenues potentiellement abusives.\n" : '')
    + "\nReponds UNIQUEMENT avec un JSON valide, sans texte avant ni apres, sans backticks.\n"
    + "Format : {\"score\":75,\"verdict\":\"Equitable\",\"verdict_titre\":\"Etat conforme\",\"resume\":\"Resume.\",\"loyer\":null,\"clauses_abusives\":[{\"type\":\"warning\",\"titre\":\"Element\",\"description\":\"Desc.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Decret 26 aout 1987\"],\"action\":\"Action.\"}],\"plan_action\":[\"Etape 1\",\"Etape 2\"]}\n\n"
    + "Distingue usure normale et degradations reelles. JSON pur uniquement.";
}

function buildLetterPrompt(letterType, analysisData, context) {
  var labels = {
    proprio: "au proprietaire pour demander la suppression des clauses illegales",
    agence: "a l'agence immobiliere pour signaler les clauses illegales",
    miseendemeure: "de mise en demeure formelle avant saisine de la conciliation",
    remboursement: "de demande de remboursement du trop-percu de loyer",
    conciliation: "de saisine de la Commission Departementale de Conciliation"
  };

  var clauses = (analysisData && analysisData.clauses_abusives) || [];
  var illegalClauses = clauses
    .filter(function(c) { return c.type === 'danger'; })
    .map(function(c) { return '- ' + c.titre + ' (' + (c.base_legale || []).join(', ') + ')'; })
    .join('\n') || 'Voir rapport complet';

  return "Redige une lettre officielle " + (labels[letterType] || letterType) + ".\n\n"
    + "Contexte :\n"
    + "- Score du bail : " + ((analysisData && analysisData.score) || '?') + "/100\n"
    + "- Ville : " + ((context && context.ville) || 'non precisee') + "\n"
    + "- Loyer : " + ((context && context.loyer_base) || 'non precise') + " euros/mois\n"
    + "- Surface : " + ((context && context.surface) || 'non precisee') + " m2\n\n"
    + "Clauses illegales detectees :\n" + illegalClauses + "\n\n"
    + "Exigences :\n"
    + "- Lettre LRAR complete et professionnelle\n"
    + "- References legales exactes (loi 6 juillet 1989, ALUR, ELAN)\n"
    + "- Ton ferme mais courtois\n"
    + "- Mentionner les recours si non-reponse sous 15 jours\n"
    + "- Champs a personnaliser entre [crochets]\n\n"
    + "Retourne la lettre en texte brut, prete a etre copiee.";
}

async function callAnthropic(messages, systemPrompt, maxTokens) {
  maxTokens = maxTokens || 1500;
  var response = await fetch(ANTHROPIC_API, {
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
      messages: messages
    })
  });
  if (!response.ok) {
    var err = await response.text();
    throw new Error("Anthropic API " + response.status + ": " + err);
  }
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Content-Type', 'application/json');

  try {
    var body = req.body;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Corps de requete invalide.' });
    }

    var context = body.context || {};

    // LETTRES
    if (body.letter_mode) {
      var sysPromptL = "Tu es BailScan, expert juridique en droit locatif francais. "
        + "Tu rediges des lettres officielles completes, professionnelles et prete a envoyer. "
        + "IMPORTANT : reponds UNIQUEMENT avec le texte brut de la lettre. "
        + "JAMAIS de JSON, JAMAIS d'accolades {}, JAMAIS de backticks, JAMAIS de cle 'lettre_lrar'. "
        + "Commence directement par les coordonnees de l'expediteur (ex: [Prenom Nom]\\n[Adresse]...).";
      var promptL = buildLetterPrompt(body.letter_type, body.analysis_data, context);
      var dataL = await callAnthropic(
        [{ role: "user", content: promptL }],
        sysPromptL, 1500
      );
      return res.status(200).json({ letter: (dataL.content && dataL.content[0] && dataL.content[0].text) || '' });
    }

    // ANALYSE
    var type = context.type_analyse || 'bail';
    var systemPrompt = buildSystemPrompt(context);
    var analysisPrompt = type === 'etat'
      ? buildEtatDesLieuxPrompt(context)
      : buildBailPrompt(context);

    var userContent;
    if (body.pdf) {
      var sizeKB = (body.pdf.length * 0.75) / 1024;
      if (sizeKB > 4000) return res.status(400).json({ error: 'PDF trop volumineux. Colle le texte directement.' });
      userContent = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: body.pdf } },
        { type: "text", text: analysisPrompt }
      ];
    } else if (body.text) {
      userContent = analysisPrompt + "\n\n---\nDOCUMENT A ANALYSER :\n\n" + body.text;
    } else {
      return res.status(400).json({ error: 'Aucun document fourni.' });
    }

    var data = await callAnthropic(
      [{ role: "user", content: userContent }],
      systemPrompt, 1800
    );

    var rawText = (data.content && data.content[0] && data.content[0].text) || '';
    var parsed;

    try {
      var clean = rawText.replace(/```json/g, '').replace(/```/g, '');
      var firstBrace = clean.indexOf('{');
      var lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
      parsed = JSON.parse(clean.trim());
    } catch (e) {
      console.error('JSON parse error:', rawText.slice(0, 500));
      return res.status(200).json({
        score: 50, verdict: 'Risque',
        verdict_titre: 'Analyse partielle',
        resume: "L'analyse a rencontre un probleme de formatage. Essayez de coller le texte de votre bail manuellement.",
        loyer: null, clauses_abusives: [],
        plan_action: ['Reessayer en collant le texte du bail dans le champ texte']
      });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('BailScan error:', error);
    return res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
};
