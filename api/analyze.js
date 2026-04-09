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
 
  var extraDocsNote = (context && context.extra_docs_labels)
    ? "\n- Documents complémentaires fournis : " + context.extra_docs_labels + " (analysés ci-dessous, prendre en compte)"
    : '';
 
  return "Tu es BailScan, expert juridique en droit locatif francais.\n"
    + "Tu maitrises : loi du 6 juillet 1989, loi ALUR (2014), loi ELAN (2018), decret 87-713.\n\n"
    + "Contexte :\n"
    + "- Type d'analyse : " + (type === 'etat' ? 'Etat des lieux' : 'Bail locatif') + "\n"
    + "- Type de location : " + locType + "\n"
    + "- Type de bien : " + bienType + "\n"
    + "- Ville : " + (ville || 'non precisee') + (encadre ? ' [ZONE ENCADREMENT LOYERS]' : '') + "\n"
    + "- Surface : " + surface + "\n"
    + "- Loyer declare : " + loyerBase + "\n"
    + "- Depot de garantie : " + depot + "\n"
    + extraDocsNote + "\n\n"
    + "Reponds TOUJOURS en JSON valide uniquement. Jamais de markdown. Jamais de backticks.";
}
 
function buildBailPrompt(context, extraDocs) {
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
 
  // Instructions explicites sur les docs complémentaires
  var extraDocsInstruction = '';
  if (extraDocs && extraDocs.length > 0) {
    var docNames = extraDocs.map(function(d){ return '"' + d.name + '"'; }).join(', ');
    extraDocsInstruction = "\n\n=== DOCUMENTS COMPLEMENTAIRES A ANALYSER OBLIGATOIREMENT ===\n"
      + "En plus du bail, le locataire a fourni " + extraDocs.length + " document(s) : " + docNames + ".\n"
      + "Tu DOIS analyser chacun de ces documents et detecter toute irregularite, clause abusive, ou element illegal qu'ils contiennent.\n"
      + "Pour chaque probleme trouve dans un document complementaire, ajoute une entree dans clauses_abusives avec le titre prefixe par le nom du document (ex: '[Conge du bailleur] Vice de forme').\n"
      + "Si un conge du bailleur est fourni : verifie le delai de preavis (6 mois minimum hors cas specifiques), la forme (LRAR ou acte d'huissier obligatoire), les motifs legaux (reprise, vente, motif legitime et serieux), et la conformite avec Art. 15 loi du 6 juillet 1989.\n"
      + "Si une revision IRL est fournie : verifie que l'indice utilise est correct, que le calcul est exact, et qu'elle respecte Art. 17-1 loi 1989.\n"
      + "=== FIN INSTRUCTIONS DOCS COMPLEMENTAIRES ===\n";
  }
 
  var formatExample = extraDocs && extraDocs.length > 0
    ? "{\"score\":75,\"verdict\":\"Risque\",\"verdict_titre\":\"3 problemes detectes\",\"resume\":\"Resume incluant les docs complementaires.\",\"loyer\":{\"statut\":\"ok\",\"analyse\":\"Analyse.\",\"plafond\":null,\"trop_percu\":null},\"clauses_abusives\":[{\"type\":\"danger\",\"titre\":\"Titre clause bail\",\"description\":\"Description.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. X loi 1989\"],\"action\":\"Action.\"},{\"type\":\"danger\",\"titre\":\"[Conge du bailleur] Vice de forme\",\"description\":\"Le conge ne respecte pas...\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. 15 loi 1989\"],\"action\":\"Contester le conge.\"}],\"plan_action\":[\"Etape 1\",\"Etape 2\",\"Etape 3\"]}"
    : "{\"score\":75,\"verdict\":\"Risque\",\"verdict_titre\":\"2 clauses a corriger\",\"resume\":\"Resume.\",\"loyer\":{\"statut\":\"ok\",\"analyse\":\"Analyse.\",\"plafond\":null,\"trop_percu\":null},\"clauses_abusives\":[{\"type\":\"danger\",\"titre\":\"Titre\",\"description\":\"Description.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. X loi 1989\"],\"action\":\"Action.\"}],\"plan_action\":[\"Etape 1\",\"Etape 2\",\"Etape 3\"]}";
 
  return "Analyse ce bail locatif francais ET tous les documents complementaires fournis." + extra + extraDocsInstruction + "\n\n"
    + "Reponds UNIQUEMENT avec un JSON valide, sans texte avant ni apres, sans backticks, sans markdown.\n"
    + "Format exact attendu :\n"
    + formatExample + "\n\n"
    + "Analyse TOUTES les irregularites trouvees dans le bail ET dans chaque document complementaire. JSON pur uniquement.";
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
 
  // Identité — utiliser les vraies valeurs, jamais de crochets si fourni
  var nomLocataire = (context && context.locataire_nom && context.locataire_nom.trim()) ? context.locataire_nom.trim() : null;
  var adresseLogement = (context && context.locataire_adresse && context.locataire_adresse.trim()) ? context.locataire_adresse.trim() : null;
  var nomProprio = (context && context.proprio_nom && context.proprio_nom.trim()) ? context.proprio_nom.trim() : null;
  var dateBail = (context && context.date_bail && context.date_bail.trim()) ? context.date_bail.trim() : null;
 
  // Montants
  var tropPercuTotal = (context && context.trop_percu_total) || '';
  var tropPercuMensuel = (context && context.trop_percu_mensuel) || '';
  var tropPercuDetail = (context && context.trop_percu_detail) || '';
  var nbMois = (context && context.nb_mois_bail) || '';
 
  // Bloc identité avec instructions strictes
  var identiteBlock = "=== INFORMATIONS A UTILISER TELLES QUELLES (NE PAS METTRE DE CROCHETS) ===\n"
    + "Nom du locataire (expediteur) : " + (nomLocataire || "A REMPLIR PAR LE LOCATAIRE") + "\n"
    + "Adresse du logement loue : " + (adresseLogement || "A REMPLIR PAR LE LOCATAIRE") + "\n"
    + "Nom du proprietaire/bailleur : " + (nomProprio || "A REMPLIR PAR LE LOCATAIRE") + "\n"
    + "Date de signature du bail : " + (dateBail || "A REMPLIR PAR LE LOCATAIRE") + "\n"
    + "=== FIN INFORMATIONS ===\n";
 
  var montantBlock = '';
  if (tropPercuTotal) {
    montantBlock = "\n=== MONTANTS A INCLURE OBLIGATOIREMENT DANS LA LETTRE ===\n"
      + "Trop-percu mensuel : " + tropPercuMensuel + "\n"
      + "Duree : " + nbMois + " mois\n"
      + "TOTAL RECLAME : " + tropPercuTotal + (tropPercuDetail ? " (" + tropPercuDetail + ")" : "") + "\n"
      + "=> Exige explicitement le remboursement de " + tropPercuTotal + " dans le corps de la lettre.\n"
      + "=== FIN MONTANTS ===\n";
  }
 
  var instructionsBlock = "\nREGLES ABSOLUES DE REDACTION :\n"
    + "1. INTERDICTION TOTALE d'utiliser des [crochets] pour les informations fournies ci-dessus\n"
    + "2. Utilise exactement les noms, adresses et dates fournis dans les informations\n"
    + "3. Si une information est marquee 'A REMPLIR', alors seulement tu peux mettre [a completer]\n"
    + "4. La lettre doit etre prete a imprimer et envoyer immediatement\n"
    + "5. Format : coordonnees expediteur en haut a gauche, coordonnees destinataire en haut a droite, date, objet, corps, formule de politesse, signature\n"
    + "6. Lettre LRAR, references legales exactes (loi 6 juillet 1989, ALUR, ELAN), ton ferme mais courtois\n"
    + "7. Mentionner les recours si non-reponse sous 15 jours\n"
    + (tropPercuTotal ? "8. Exiger le remboursement de " + tropPercuTotal + " de maniere explicite\n" : "");
 
  return "Redige une lettre officielle " + (labels[letterType] || letterType) + ".\n\n"
    + identiteBlock + "\n"
    + "Contexte du bail :\n"
    + "- Score du bail : " + ((analysisData && analysisData.score) || '?') + "/100\n"
    + "- Ville : " + ((context && context.ville) || 'non precisee') + "\n"
    + "- Loyer : " + ((context && context.loyer_base) || 'non precise') + " euros/mois\n"
    + "- Surface : " + ((context && context.surface) || 'non precisee') + " m2\n"
    + montantBlock + "\n"
    + "Clauses illegales detectees :\n" + illegalClauses + "\n"
    + instructionsBlock + "\n"
    + "Retourne UNIQUEMENT le texte brut de la lettre, sans introduction ni commentaire.";
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
    var extraDocs = body.extra_docs || [];
    var systemPrompt = buildSystemPrompt(context);
    var analysisPrompt = type === 'etat'
      ? buildEtatDesLieuxPrompt(context)
      : buildBailPrompt(context, extraDocs);
 
    // Plus de tokens si docs complémentaires
    var maxTokensAnalysis = extraDocs.length > 0 ? 2800 : 1800;
 
    var userContent;
    if (body.pdf) {
      var sizeKB = (body.pdf.length * 0.75) / 1024;
      if (sizeKB > 4000) return res.status(400).json({ error: 'PDF trop volumineux. Colle le texte directement.' });
 
      // Document principal
      userContent = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: body.pdf } }
      ];
 
      // Documents complémentaires
      if (extraDocs.length > 0) {
        userContent.push({
          type: "text",
          text: "\n\nDocuments complémentaires fournis par le locataire (" + extraDocs.length + ") — à analyser obligatoirement :"
        });
        extraDocs.forEach(function(doc) {
          var docSizeKB = (doc.base64.length * 0.75) / 1024;
          if (docSizeKB <= 4000) {
            userContent.push({ type: "text", text: "--- " + doc.name + " ---" });
            userContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } });
          }
        });
      }
 
      userContent.push({ type: "text", text: analysisPrompt });
 
    } else if (body.text) {
      var extraDocsText = '';
      if (extraDocs.length > 0) {
        extraDocsText = '\n\nDocuments complémentaires joints : ' + extraDocs.map(function(d){ return d.name; }).join(', ') + '. Analyse-les et signale toute irregularite dans les clauses_abusives.';
      }
      userContent = analysisPrompt + "\n\n---\nDOCUMENT A ANALYSER :\n\n" + body.text + extraDocsText;
    } else {
      return res.status(400).json({ error: 'Aucun document fourni.' });
    }
 
    var data = await callAnthropic(
      [{ role: "user", content: userContent }],
      systemPrompt, maxTokensAnalysis
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
 
