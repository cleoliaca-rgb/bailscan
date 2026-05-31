// BailScan — API analyze.js
// CommonJS pur — compatible Vercel sans type:module

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// ─────────────────────────────────────────────────────────────
// GRILLES D'ENCADREMENT EMBARQUEES (lookup precis ville x secteur x pieces x epoque x type)
// Le fichier api/data/grilles-encadrement.json contient les valeurs des arretes prefectoraux.
// Les grilles evoluent au moins une fois par an : a actualiser quand un nouvel arrete sort.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
let GRILLES_ENCADREMENT = null;
function getGrilles() {
  if (GRILLES_ENCADREMENT) return GRILLES_ENCADREMENT;
  // 1) Tentative via require() — methode preferee sur Vercel (file-trace inclut automatiquement le JSON)
  try {
    GRILLES_ENCADREMENT = require('./data/grilles-encadrement.json');
    if (GRILLES_ENCADREMENT && typeof GRILLES_ENCADREMENT === 'object') {
      console.log('[grilles] Charge via require() ./data/grilles-encadrement.json');
      return GRILLES_ENCADREMENT;
    }
  } catch (e1) {
    console.warn('[grilles] require() echec:', e1 && e1.message);
  }
  // 2) Fallback : fs.readFileSync avec __dirname (resolution relative au fichier analyze.js)
  try {
    var p1 = path.join(__dirname, 'data', 'grilles-encadrement.json');
    GRILLES_ENCADREMENT = JSON.parse(fs.readFileSync(p1, 'utf8'));
    console.log('[grilles] Charge via fs.readFileSync depuis __dirname:', p1);
    return GRILLES_ENCADREMENT;
  } catch (e2) {
    console.warn('[grilles] __dirname echec:', e2 && e2.message);
  }
  // 3) Fallback : process.cwd() (dev local)
  try {
    var p2 = path.join(process.cwd(), 'api', 'data', 'grilles-encadrement.json');
    GRILLES_ENCADREMENT = JSON.parse(fs.readFileSync(p2, 'utf8'));
    console.log('[grilles] Charge via fs.readFileSync depuis cwd:', p2);
    return GRILLES_ENCADREMENT;
  } catch (e3) {
    console.error('[grilles] ECHEC TOTAL chargement grilles-encadrement.json:', e3 && e3.message);
  }
  GRILLES_ENCADREMENT = { _meta: { version: 'fallback-empty' } };
  return GRILLES_ENCADREMENT;
}

function normaliseVille(ville) {
  if (!ville) return null;
  var v = String(ville).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\d+\s*(er|e|eme|ème)\s*(arrondissement)?/g, '')
    .replace(/\s+/g, ' ').trim();
  // Encadrement strict (grilles prefectorales en vigueur)
  if (v.indexOf('lyon') >= 0 || v.indexOf('villeurbanne') >= 0) return 'lyon';
  if (v.indexOf('lille') >= 0 || v.indexOf('hellemmes') >= 0 || v.indexOf('lomme') >= 0) return 'lille';
  if (v.indexOf('paris') >= 0) return 'paris';
  if (v.indexOf('montpellier') >= 0) return 'montpellier';
  // Zones tendues / indicatif
  if (v.indexOf('bordeaux') >= 0) return 'bordeaux';
  if (v.indexOf('plaisance') >= 0 && v.indexOf('touch') >= 0) return 'plaisance-du-touch';
  if (v.indexOf('toulouse') >= 0) return 'toulouse';
  if (v.indexOf('nantes') >= 0) return 'nantes';
  if (v.indexOf('marseille') >= 0 || v.indexOf('aix-en-provence') >= 0 || v.indexOf('aix en provence') >= 0) return 'marseille';
  if (v.indexOf('nice') >= 0) return 'nice';
  if (v.indexOf('strasbourg') >= 0) return 'strasbourg';
  if (v.indexOf('rennes') >= 0) return 'rennes';
  if (v.indexOf('grenoble') >= 0) return 'grenoble';
  if (v.indexOf('rouen') >= 0) return 'rouen';
  if (v.indexOf('saint-etienne') >= 0 || v.indexOf('saint etienne') >= 0) return 'saint-etienne';
  if (v.indexOf('le mans') >= 0) return 'le-mans';
  if (v.indexOf('reims') >= 0) return 'reims';
  if (v.indexOf('toulon') >= 0) return 'toulon';
  if (v.indexOf('angers') >= 0) return 'angers';
  if (v.indexOf('dijon') >= 0) return 'dijon';
  if (v.indexOf('brest') >= 0) return 'brest';
  if (v.indexOf('clermont') >= 0) return 'clermont-ferrand';
  if (v.indexOf('tours') >= 0) return 'tours';
  if (v.indexOf('limoges') >= 0) return 'limoges';
  if (v.indexOf('amiens') >= 0) return 'amiens';
  if (v.indexOf('annecy') >= 0) return 'annecy';
  if (v.indexOf('arcachon') >= 0 || v.indexOf('la teste') >= 0) return 'arcachon';
  if (v.indexOf('biarritz') >= 0 || v.indexOf('bayonne') >= 0 || v.indexOf('anglet') >= 0) return 'bayonne';
  if (v.indexOf('nimes') >= 0) return 'nimes';
  if (v.indexOf('le havre') >= 0) return 'le-havre';
  return v.replace(/\s+/g, '-');
}

function devineEpoque(input) {
  if (!input) return 'apres1990';
  if (typeof input === 'number') {
    if (input < 1946) return 'avant1946';
    if (input <= 1970) return '1946-70';
    if (input <= 1990) return '1971-90';
    return 'apres1990';
  }
  var txt = String(input).toLowerCase();
  var m = txt.match(/\b(19|20)\d{2}\b/);
  if (m) return devineEpoque(parseInt(m[0], 10));
  if (/haussmann|pierre de taille|ancien.*immeuble|avant.guerre/.test(txt)) return 'avant1946';
  if (/recent|neuf|moderne|2000|2010|2020/.test(txt)) return 'apres1990';
  return 'apres1990';
}

function devineSecteur(villeKey, quartier) {
  if (!quartier) return '1';
  var q = String(quartier).toLowerCase();
  if (villeKey === 'paris') {
    if (/\b(1er|2e|4e|7e|8e)\b/.test(q)) return '1';
    if (/\b(11e|12e|13e|14e|20e)\b/.test(q)) return '11';
    if (/\b(15e|16e)\b/.test(q)) return '5';
    return '5';
  }
  return '1';
}

/**
 * Lookup precis du loyer de reference + plafond legal pour un logement donne.
 * Strategie de fallback ultra-permissive : si la cle exacte n'existe pas,
 * on essaie des variantes (epoque, nb_pieces, type, secteur) avant d'abandonner.
 * Retourne null seulement si la ville n'est pas du tout dans la grille.
 */
function getLoyerPlafond(opts) {
  var grilles = getGrilles();
  var villeKey = normaliseVille(opts && opts.ville);
  if (!villeKey) return null;

  // 1) Recherche ville exacte
  var conf = grilles[villeKey];
  // 2) Fallback : default france si ville inconnue
  if (!conf && grilles['_default_france']) {
    conf = grilles['_default_france'];
    console.log('[grilles] Ville "' + villeKey + '" non trouvee, fallback _default_france');
  }
  if (!conf || !conf.loyers) {
    console.log('[grilles] Aucune config pour ville:', villeKey, '— grilles disponibles:', Object.keys(grilles).filter(function(k){ return k !== '_meta'; }).join(','));
    return null;
  }

  // 3) Choix du secteur (avec fallback sur le premier dispo)
  var secteur = devineSecteur(villeKey, opts && opts.quartier);
  var secteurData = conf.loyers[secteur];
  if (!secteurData) {
    var secteursKeys = Object.keys(conf.loyers);
    if (secteursKeys.length > 0) {
      secteur = secteursKeys[0];
      secteurData = conf.loyers[secteur];
    }
  }
  if (!secteurData) return null;

  // 4) Cles a tester en cascade (du plus precis au plus generique)
  var np = Math.min(Math.max(parseInt((opts && opts.nbPieces) || 1, 10), 1), 4);
  var epoque = (opts && opts.epoque) || 'apres1990';
  var typeKey = (opts && opts.typeBien && /meubl/i.test(opts.typeBien)) ? 'meuble' : 'vide';
  var altType = typeKey === 'meuble' ? 'vide' : 'meuble';

  var attempts = [
    np + '_' + epoque + '_' + typeKey,             // exact
    np + '_apres1990_' + typeKey,                  // fallback epoque
    np + '_1971-90_' + typeKey,
    np + '_1946-70_' + typeKey,
    np + '_avant1946_' + typeKey,
    np + '_' + epoque + '_' + altType,             // fallback type
    np + '_apres1990_' + altType,
    Math.max(1, np-1) + '_apres1990_' + typeKey,   // fallback nb_pieces-1
    Math.min(4, np+1) + '_apres1990_' + typeKey,   // fallback nb_pieces+1
    '1_apres1990_vide'                              // ultime fallback
  ];

  var entry = null;
  var matchedKey = null;
  for (var i = 0; i < attempts.length; i++) {
    if (secteurData[attempts[i]]) {
      entry = secteurData[attempts[i]];
      matchedKey = attempts[i];
      break;
    }
  }
  // Si toujours rien, prendre la premiere entree disponible du secteur
  if (!entry) {
    var firstKey = Object.keys(secteurData)[0];
    if (firstKey) {
      entry = secteurData[firstKey];
      matchedKey = firstKey;
    }
  }
  if (!entry) return null;

  console.log('[grilles] Match', villeKey, 'secteur', secteur, 'cle', matchedKey, '→ plafond_m2:', entry.majore);

  return {
    plafond_m2: entry.majore,
    ref_m2: entry.ref,
    minore_m2: entry.minore,
    type: typeKey,
    epoque: epoque,
    secteur: secteur,
    ville: villeKey,
    encadrement_actif: conf.encadrement_actif === true,
    indicatif: conf.type === 'indicatif',
    source: 'Grille ' + villeKey + ' ' + (conf.annee || '2025') + ' secteur ' + secteur,
    disclaimer: grilles._meta && grilles._meta.disclaimer
  };
}

// Estimation simple du nombre de pieces a partir de la surface
function estimateNbPieces(surface) {
  var s = parseFloat(surface) || 0;
  if (s <= 0) return 1;
  if (s < 30) return 1;
  if (s < 50) return 2;
  if (s < 75) return 3;
  return 4;
}

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

// ─────────────────────────────────────────────────────────────
// CALCUL ENCADREMENT DES LOYERS — DÉTERMINISTE CÔTÉ SERVEUR
// L'encadrement (art. 17 loi 6 juillet 1989) se calcule TOUJOURS
// sur le loyer HORS CHARGES. Les charges n'entrent jamais dans
// la comparaison au plafond légal.
// On calcule ici en JS pour ne PAS laisser l'IA inventer le chiffre.
// ─────────────────────────────────────────────────────────────
function computeLoyerM2(context) {
  var loyerBase = parseFloat(context && context.loyer_base) || 0;
  var surface = parseFloat(context && context.surface) || 0;
  if (loyerBase <= 0 || surface <= 0) return null;
  // Loyer hors charges / surface — règle ALUR
  return Math.round((loyerBase / surface) * 100) / 100;
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
  var loyerM2 = computeLoyerM2(context);

  // Lookup precis dans les grilles JSON (ou recherche web prealable)
  var plafondInfo = (context && context._plafondInfo) || getLoyerPlafond({
    ville: ville,
    nbPieces: (context && context.nb_pieces) || estimateNbPieces(context && context.surface),
    epoque: devineEpoque(context && context.annee_construction),
    typeBien: bienType,
    quartier: (context && context.quartier) || ville
  });
 
  var extraDocsNote = (context && context.extra_docs_labels)
    ? "\n- Documents complementaires fournis : " + context.extra_docs_labels + " (analyses ci-dessous, prendre en compte)"
    : '';

  // Bloc grille d'encadrement officielle (si dispo)
  // IMPORTANT : ce bloc est UNIQUEMENT pour le calcul interne de Claude.
  // Claude ne doit JAMAIS restituer ces details dans son output (analyse, resume).
  // L'utilisateur final ne doit PAS voir les valeurs precises de la grille interne.
  var grilleNote = '';
  if (plafondInfo) {
    grilleNote = "\n\n=== GRILLE INTERNE — USAGE BACKEND UNIQUEMENT (NE PAS REVELER A L'UTILISATEUR) ===\n"
      + "Les valeurs ci-dessous te servent UNIQUEMENT a calculer le statut du loyer.\n"
      + "Tu NE DOIS PAS mentionner ces valeurs precises, ni la source 'grille', ni le secteur,\n"
      + "ni l'epoque, ni la zone dans ton analyse ou ton resume.\n"
      + "Plafond legal a utiliser pour le calcul : " + plafondInfo.plafond_m2 + " euros/m2\n"
      + "Loyer de reference : " + plafondInfo.ref_m2 + " euros/m2\n"
      + "Loyer minore : " + plafondInfo.minore_m2 + " euros/m2\n"
      + (plafondInfo.encadrement_actif
          ? "Encadrement strict actif dans cette zone : le loyer/m2 hors charges ne doit PAS depasser le plafond ci-dessus.\n"
          : "Zone tendue sans encadrement strict opposable.\n")
      + "\nDANS TON OUTPUT :\n"
      + "- Champ 'plafond' : indique simplement la valeur (ex : '" + plafondInfo.plafond_m2 + " euros/m2') SANS mentionner sa source.\n"
      + "- Champ 'analyse' : explique le resultat (conforme/non conforme) en termes generaux, SANS dire 'd'apres la grille...', 'selon l'arrete...', 'zone X', etc.\n"
      + "- Ajoute systematiquement la mention : 'Verifiez la valeur a jour aupres du simulateur officiel de votre prefecture.'\n"
      + "=== FIN GRILLE INTERNE ===";
  }

  // Bloc règle absolue encadrement — injecté dans le system prompt
  var regleEncadrement = "\n\n=== REGLE ABSOLUE — ENCADREMENT DES LOYERS ===\n"
    + "L'encadrement des loyers (art. 17 loi du 6 juillet 1989, loi ALUR) se calcule\n"
    + "EXCLUSIVEMENT sur le loyer HORS CHARGES divise par la surface.\n"
    + "INTERDICTIONS ABSOLUES :\n"
    + "1. NE JAMAIS ajouter les charges au loyer pour calculer le prix au m2.\n"
    + "2. NE JAMAIS ecrire 'avec les charges, le loyer total est X euros, soit Y euros/m2'.\n"
    + "3. NE JAMAIS ecrire 'charges comprises' dans le champ analyse du loyer.\n"
    + "4. NE JAMAIS inventer un chiffre euros/m2 different du calcul officiel ci-dessous.\n"
    + "5. Le SEUL chiffre euros/m2 autorise est celui pre-calcule fourni dans le prompt utilisateur.\n"
    + "Si tu enfreins ces regles, l'analyse sera rejetee.\n"
    + "=== FIN REGLE ABSOLUE ===";

  // Bloc renforce : OBLIGATION DE LECTURE INTEGRALE DU BAIL
  var regleLecture = "\n\n=== REGLE ABSOLUE — LECTURE INTEGRALE DU BAIL ===\n"
    + "Si un document de bail (PDF ou texte) est attache a cette requete, TU DOIS le lire INTEGRALEMENT,\n"
    + "clause par clause, de la premiere a la derniere ligne. Les informations du formulaire ci-dessus\n"
    + "(loyer, depot, ville, etc.) ne sont qu'un complement : ELLES NE REMPLACENT PAS la lecture du bail.\n\n"
    + "OBLIGATIONS DE LECTURE :\n"
    + "1. Extraire et analyser CHAQUE clause du bail, meme celles qui paraissent standards.\n"
    + "2. Identifier les parties (bailleur, locataire), la description du bien, la duree, le loyer,\n"
    + "   les charges, le depot, la revision (IRL), les conditions de resiliation, les clauses\n"
    + "   penales/resolutoires, les restrictions d'usage, la solidarite, les travaux.\n"
    + "3. Detecter 100% des clauses problematiques (abusives, illegales, ambigues) — une clause\n"
    + "   repandue n'est PAS legale pour autant. Sois particulierement vigilant sur :\n"
    + "   - depot de garantie excessif (> 1 mois vide / > 2 mois meuble)\n"
    + "   - complement de loyer non justifie ou injustifiable (criteres cumulatifs Art. 17-2)\n"
    + "   - frais d'agence illegaux (au-dela du plafond loi ALUR)\n"
    + "   - clauses interdisant animaux familiers (illegal sauf NAC dangereux)\n"
    + "   - solidarite abusive entre colocataires\n"
    + "   - clauses imposant travaux locataire (illegal hors menues reparations decret 1987)\n"
    + "   - clauses sur visites (limites legales horaires)\n"
    + "   - assurance imposee par un assureur designe (illegal)\n"
    + "4. Pour CHAQUE clause analysee : citer ou paraphraser brievement, statuer (ok/warning/danger),\n"
    + "   donner la reference legale precise (article + loi), preciser l'action concrete si problematique.\n"
    + "5. Si le bail est court (< 200 mots) ou si tu n'arrives pas a extraire les clauses, INDIQUE-LE\n"
    + "   explicitement dans le resume au lieu d'inventer.\n"
    + "=== FIN REGLE ===";
 
  return "Tu es BailScan, expert juridique en droit locatif francais.\n"
    + "Tu maitrises : loi du 6 juillet 1989, loi ALUR (2014), loi ELAN (2018), decret 87-713,\n"
    + "Code civil, Code de la construction et de l'habitation, jurisprudence Cour de cassation chambre civile 3e.\n\n"
    + "Contexte du logement :\n"
    + "- Type d'analyse : " + (type === 'etat' ? 'Etat des lieux' : 'Bail locatif') + "\n"
    + "- Type de location : " + locType + "\n"
    + "- Type de bien : " + bienType + "\n"
    + "- Ville : " + (ville || 'non precisee') + (encadre ? ' [ZONE ENCADREMENT LOYERS]' : '') + "\n"
    + "- Surface : " + surface + "\n"
    + "- Loyer declare (hors charges) : " + loyerBase + "\n"
    + (loyerM2 !== null ? "- Loyer au m2 (calcul officiel hors charges) : " + loyerM2.toFixed(2).replace('.', ',') + " euros/m2\n" : '')
    + "- Depot de garantie : " + depot + "\n"
    + extraDocsNote
    + grilleNote
    + regleEncadrement
    + regleLecture
    + "\n\nReponds TOUJOURS en JSON valide uniquement. Jamais de markdown. Jamais de backticks. Jamais de prose hors JSON.";
}
 
function buildBailPrompt(context, extraDocs) {
  var depot = (context && context.depot) || 0;
  var bienType = (context && context.type_bien === 'meuble') ? 'meuble' : 'vide';
  var depotMax = bienType === 'meuble' ? 2 : 1;
  var ville = (context && context.ville) || '';
  var surface = (context && context.surface) || null;
  var loyerBase = (context && context.loyer_base) || null;
  var skipForm = context && context._skip_form === true;
  var encadre = isVilleEncadree(ville);
  var loyerM2 = computeLoyerM2(context);

  // Plafond precis depuis la grille embarquee ou recherche web (resolution faite dans handler)
  var plafondInfo = (context && context._plafondInfo) || getLoyerPlafond({
    ville: ville,
    nbPieces: (context && context.nb_pieces) || estimateNbPieces(surface),
    epoque: devineEpoque(context && context.annee_construction),
    typeBien: bienType,
    quartier: (context && context.quartier) || ville
  });
 
  var extra = '';

  // ─────────────────────────────────────────────────────────────
  // MODE EXTRACTION AUTO : le user n'a pas rempli le formulaire,
  // Claude doit tout extraire du PDF du bail.
  // ─────────────────────────────────────────────────────────────
  if (skipForm) {
    extra += "\n=== MODE EXTRACTION AUTOMATIQUE ===\n"
      + "Le locataire n'a PAS rempli le formulaire. Tu dois EXTRAIRE toutes les informations du bail attache.\n"
      + "Inclus OBLIGATOIREMENT dans ton JSON un champ 'context_extrait' avec :\n"
      + "  - ville : nom de la commune du logement (string)\n"
      + "  - surface : surface habitable en m2 (number)\n"
      + "  - loyer_base : loyer mensuel HORS CHARGES en euros (number)\n"
      + "  - charges : montant des charges en euros (number, 0 si non specifie)\n"
      + "  - depot : depot de garantie en euros (number, 0 si non specifie)\n"
      + "  - type_bien : 'vide' ou 'meuble' (string)\n"
      + "  - type_location : 'principale' ou 'meublee_principale' ou 'autre' (string)\n"
      + "  - complement_loyer : montant du complement de loyer s'il existe, sinon 0 (number)\n"
      + "  - complement_justif : justification du complement si presente dans le bail (string, vide sinon)\n"
      + "  - date_debut_bail : date de prise d'effet du bail au format YYYY-MM-DD (string, vide si non trouvee)\n"
      + "  - nb_mois_bail : nombre de mois ecoules depuis le debut du bail (number, 0 si date inconnue)\n"
      + "Si une information n'est pas trouvable dans le bail, mets une valeur par defaut raisonnable et signale-le dans le resume.\n"
      + "Apres l'extraction, utilise ces valeurs pour ton analyse comme si elles avaient ete saisies par le locataire.\n"
      + "=== FIN MODE EXTRACTION ===\n";
  }

  if (encadre && loyerBase && surface) {
    extra += "\nATTENTION : " + ville + " est en zone d'encadrement des loyers.\n"
      + "Loyer declare HORS CHARGES : " + loyerBase + " euros/mois pour " + surface + " m2.\n"
      + (loyerM2 !== null ? "LOYER AU M2 (calcul officiel hors charges, valeur imposee) : " + loyerM2.toFixed(2).replace('.', ',') + " euros/m2.\n" : '')
      + "Compare UNIQUEMENT ce chiffre au plafond legal du bail. N'ajoute jamais les charges.\n";
    if (plafondInfo && plafondInfo.encadrement_actif) {
      extra += "PLAFOND LEGAL (USAGE BACKEND, NE PAS REVELER LA SOURCE) : " + plafondInfo.plafond_m2 + " euros/m2.\n"
        + "Dans le champ 'plafond' : indique simplement '" + plafondInfo.plafond_m2 + " euros/m2' sans mention de source/secteur/grille.\n"
        + "Statut 'ok' si " + (loyerM2 !== null ? loyerM2.toFixed(2).replace('.', ',') : 'le loyer/m2') + " <= " + plafondInfo.plafond_m2 + ".\n"
        + "Statut 'danger' UNIQUEMENT si " + (loyerM2 !== null ? loyerM2.toFixed(2).replace('.', ',') : 'le loyer/m2') + " > " + plafondInfo.plafond_m2 + ".\n"
        + "Dans 'analyse' : explique le resultat en termes generaux SANS mentionner la grille interne. Ajoute : 'Valeur indicative — verifiez la valeur a jour sur le simulateur officiel.'\n";
    } else {
      extra += "Si le bail mentionne un plafond legal, indique-le dans le champ 'plafond' (format: 'X,XX euros/m2').\n"
        + "Le statut doit etre 'ok' si " + (loyerM2 !== null ? loyerM2.toFixed(2).replace('.', ',') : 'le loyer/m2') + " <= plafond.\n"
        + "Le statut doit etre 'danger' UNIQUEMENT si " + (loyerM2 !== null ? loyerM2.toFixed(2).replace('.', ',') : 'le loyer/m2') + " > plafond.";
    }
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
    ? "{\"score\":75,\"verdict\":\"Risque\",\"verdict_titre\":\"3 problemes detectes\",\"resume\":\"Resume incluant les docs complementaires.\",\"loyer\":{\"statut\":\"ok\",\"analyse\":\"Analyse hors charges uniquement.\",\"plafond\":null,\"trop_percu\":null},\"clauses_abusives\":[{\"type\":\"danger\",\"titre\":\"Titre clause bail\",\"description\":\"Description.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. X loi 1989\"],\"action\":\"Action.\"},{\"type\":\"danger\",\"titre\":\"[Conge du bailleur] Vice de forme\",\"description\":\"Le conge ne respecte pas...\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. 15 loi 1989\"],\"action\":\"Contester le conge.\"}],\"plan_action\":[\"Etape 1\",\"Etape 2\",\"Etape 3\"]}"
    : "{\"score\":75,\"verdict\":\"Risque\",\"verdict_titre\":\"2 clauses a corriger\",\"resume\":\"Resume.\",\"loyer\":{\"statut\":\"ok\",\"analyse\":\"Analyse hors charges uniquement.\",\"plafond\":null,\"trop_percu\":null},\"clauses_abusives\":[{\"type\":\"danger\",\"titre\":\"Titre\",\"description\":\"Description.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. X loi 1989\"],\"action\":\"Action.\"}],\"plan_action\":[\"Etape 1\",\"Etape 2\",\"Etape 3\"]}";

  // Si mode extraction auto, ajouter le champ context_extrait au format attendu
  if (skipForm) {
    formatExample = formatExample.replace(/\}$/, ',\"context_extrait\":{\"ville\":\"Bordeaux\",\"surface\":73,\"loyer_base\":1287,\"charges\":50,\"depot\":1287,\"type_bien\":\"vide\",\"type_location\":\"principale\",\"complement_loyer\":0,\"complement_justif\":\"\",\"date_debut_bail\":\"2024-09-01\",\"nb_mois_bail\":21}}');
  }

  // Determiner si un bail est fourni (PDF ou texte > 200 chars)
  var hasBail = (context && context.bail_pdf_base64) || (context && context.bail_text && String(context.bail_text).length > 200);
  var lectureRappel = hasBail
    ? "\n\n⚠️ INSTRUCTION CRITIQUE — BAIL ATTACHE ⚠️\n"
      + "Un document de bail est fourni dans cette requete. TU DOIS le lire INTEGRALEMENT, clause par clause.\n"
      + "Les informations du formulaire (loyer, depot, ville) ne remplacent PAS la lecture du bail.\n"
      + "Pour chaque clause du bail : extraire le texte, statuer ok/warning/danger, citer la reference legale precise.\n"
      + "Detecter 100% des clauses problematiques (depot excessif, complement injustifie, frais d'agence illegaux,\n"
      + "interdiction animaux, solidarite abusive, travaux locataire, visites abusives, assurance imposee, etc.).\n"
      + "Si tu ne peux pas extraire les clauses du document (ex: PDF illisible), INDIQUE-LE explicitement dans 'resume' au lieu d'inventer.\n"
      + "⚠️ FIN INSTRUCTION ⚠️\n"
    : "\n\n⚠️ Aucun bail fourni dans cette requete : analyse limitee aux informations du formulaire (loyer, depot, complement). Le precise dans le resume.\n";

  return "Analyse ce bail locatif francais ET tous les documents complementaires fournis." + extra + extraDocsInstruction + lectureRappel + "\n"
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

// ─────────────────────────────────────────────────────────────
// SANITIZE — Filet de securite final
// Si l'IA enfreint les regles malgre le prompt, on rattrape ici :
// 1. On retire les phrases "charges comprises" du champ analyse
// 2. On retire les parentheses "(X,XX€/m² vs Y€/m²)" du resume
// 3. On RECALCULE le statut a partir des chiffres reels hors charges
// ─────────────────────────────────────────────────────────────
function sanitizeAnalysis(parsed, context) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  // ────────────────────────────────────────────────────────────
  // MODE EXTRACTION AUTO : si le user a saute le formulaire, Claude a extrait
  // les infos dans parsed.context_extrait. On hydrate le context avec ces
  // valeurs pour que la suite du sanitize (forcage plafond, calculs) tourne
  // comme si le user avait rempli le formulaire.
  // ────────────────────────────────────────────────────────────
  if (context && context._skip_form && parsed.context_extrait) {
    var ext = parsed.context_extrait;
    if (ext.ville && !context.ville) context.ville = ext.ville;
    if (ext.surface && !context.surface) context.surface = ext.surface;
    if (ext.loyer_base && !context.loyer_base) context.loyer_base = ext.loyer_base;
    if (ext.charges !== undefined && !context.charges) context.charges = ext.charges;
    if (ext.depot !== undefined && !context.depot) context.depot = ext.depot;
    if (ext.type_bien && !context.type_bien) context.type_bien = ext.type_bien;
    if (ext.type_location && !context.type_location) context.type_location = ext.type_location;
    if (ext.complement_loyer !== undefined && !context.complement_loyer) context.complement_loyer = ext.complement_loyer;
    if (ext.complement_justif && !context.complement_justif) context.complement_justif = ext.complement_justif;
    console.log('[skip_form] Context hydrate depuis extraction:', JSON.stringify({
      ville: context.ville, surface: context.surface, loyer_base: context.loyer_base,
      depot: context.depot, type_bien: context.type_bien
    }));

    // Re-resoudre le plafond avec les valeurs extraites
    try {
      var newPlafond = getLoyerPlafond({
        ville: context.ville,
        nbPieces: estimateNbPieces(context.surface),
        epoque: 'apres1990',
        typeBien: context.type_bien || 'vide',
        quartier: context.ville
      });
      if (newPlafond) {
        context._plafondInfo = newPlafond;
        console.log('[skip_form] Plafond re-resolu apres extraction:', newPlafond.plafond_m2, '€/m²');
      }
    } catch (e) {
      console.warn('[skip_form] Erreur re-resolution plafond:', e && e.message);
    }
  }

  var loyerM2 = computeLoyerM2(context);
  var loyerBase = parseFloat(context && context.loyer_base) || 0;
  var surface = parseFloat(context && context.surface) || 0;

  // ────────────────────────────────────────────────────────────
  // 0. FORCAGE DU PLAFOND DEPUIS LA GRILLE (locale ou recherche web)
  //    Resolution faite dans le handler principal et stockee dans
  //    context._plafondInfo. On utilise cette valeur en priorite.
  // ────────────────────────────────────────────────────────────
  var plafondInfo = (context && context._plafondInfo) || getLoyerPlafond({
    ville: (context && context.ville) || '',
    nbPieces: (context && context.nb_pieces) || estimateNbPieces(context && context.surface),
    epoque: devineEpoque(context && context.annee_construction),
    typeBien: (context && context.type_bien) || 'vide',
    quartier: (context && context.quartier) || (context && context.ville)
  });

  if (plafondInfo && loyerM2 !== null && surface > 0) {
    if (!parsed.loyer || typeof parsed.loyer !== 'object') parsed.loyer = {};
    // Forcer le plafond a la valeur grille (format texte attendu par le frontend)
    var plafondMensuelGrille = Math.round(plafondInfo.plafond_m2 * surface * 100) / 100;
    parsed.loyer.plafond = plafondMensuelGrille.toFixed(2).replace('.', ',') + ' €';
    parsed.loyer.plafond_m2 = plafondInfo.plafond_m2.toFixed(2).replace('.', ',') + ' €/m²';
    // Exposer aussi les loyers de reference et minore pour la comparaison marche (frontend)
    parsed.loyer.ref_m2 = plafondInfo.ref_m2.toFixed(2).replace('.', ',') + ' €/m²';
    parsed.loyer.ref_m2_num = plafondInfo.ref_m2;
    parsed.loyer.minore_m2_num = plafondInfo.minore_m2;
    parsed.loyer.plafond_m2_num = plafondInfo.plafond_m2;
    parsed.loyer.encadrement_strict = plafondInfo.encadrement_actif;
    // Calcul statut deterministe a partir de la grille
    var depasse = loyerM2 > plafondInfo.plafond_m2 + 0.01;
    if (plafondInfo.encadrement_actif) {
      parsed.loyer.statut = depasse ? 'danger' : 'ok';
    } else {
      // Zone indicative (Bordeaux, Plaisance-du-Touch) : pas de plafond opposable, on indique simplement
      parsed.loyer.statut = depasse ? 'warning' : 'ok';
    }
    // Reformuler l'analyse en termes generaux (sans reveler la source de la grille)
    var loyM2Txt = loyerM2.toFixed(2).replace('.', ',');
    var plafM2Txt = plafondInfo.plafond_m2.toFixed(2).replace('.', ',');
    if (depasse) {
      var exedentMensuel = Math.round((loyerM2 - plafondInfo.plafond_m2) * surface * 100) / 100;
      parsed.loyer.exedent_mensuel = exedentMensuel;
      if (plafondInfo.encadrement_actif) {
        parsed.loyer.analyse = "Votre loyer s'eleve a " + loyM2Txt + " euros/m2 hors charges, ce qui depasse le plafond legal estime (" + plafM2Txt + " euros/m2). Cette valeur etant indicative, verifiez la valeur a jour sur le simulateur officiel de votre prefecture.";
      } else {
        parsed.loyer.analyse = "Votre loyer s'eleve a " + loyM2Txt + " euros/m2 hors charges, ce qui est superieur au repere indicatif local (" + plafM2Txt + " euros/m2). Cette zone n'est pas encadree strictement, mais cela peut etre un point de negociation. Verifiez les references locales sur les simulateurs officiels.";
      }
    } else {
      parsed.loyer.exedent_mensuel = null;
      parsed.loyer.trop_percu = null;
      if (plafondInfo.encadrement_actif) {
        parsed.loyer.analyse = "Votre loyer s'eleve a " + loyM2Txt + " euros/m2 hors charges, ce qui respecte le plafond legal estime (" + plafM2Txt + " euros/m2). Valeur indicative — verifiez sur le simulateur officiel de votre prefecture.";
      } else {
        parsed.loyer.analyse = "Votre loyer s'eleve a " + loyM2Txt + " euros/m2 hors charges, ce qui est conforme au repere indicatif local (" + plafM2Txt + " euros/m2). Cette zone n'est pas encadree strictement.";
      }
    }
  }

  // 1. Nettoyage du champ loyer.analyse
  if (parsed.loyer && parsed.loyer.analyse) {
    var a = parsed.loyer.analyse;
    a = a.replace(/\.?\s*Cependant,?\s*avec les charges[^.]*?\d+[,.]?\d*\s*€\/m²[^.]*?\.\s*/gi, '. ');
    a = a.replace(/\s*avec les charges[^,.]*?,\s*le loyer total[^.]*?\d+[,.]?\d*\s*€\/m²[^.]*?\.\s*/gi, ' ');
    a = a.replace(/\s*charges comprises[^.]*?\d+[,.]?\d*\s*€\/m²[^.]*?\.\s*/gi, ' ');
    a = a.replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
    parsed.loyer.analyse = a;
  }

  // 1b. Filet de securite : retirer toute reference a la grille interne dans l'analyse
  //     (ex: "selon la grille Lyon 2025 secteur 1...", "d'apres l'arrete prefectoral...")
  if (parsed.loyer && parsed.loyer.analyse) {
    parsed.loyer.analyse = parsed.loyer.analyse
      .replace(/\s*\(?selon\s+(la\s+grille|l[' ]arr[eê]t[eé])[^,.)]*\)?[,.]?\s*/gi, ' ')
      .replace(/\s*\(?d[' ]apr[eè]s\s+(la\s+grille|l[' ]arr[eê]t[eé])[^,.)]*\)?[,.]?\s*/gi, ' ')
      .replace(/\s*\(?grille\s+(de|d[' ]encadrement|pref[eé]ctorale)[^,.)]*\)?[,.]?\s*/gi, ' ')
      .replace(/\s*secteur\s+\d+[,.]?\s*/gi, ' ')
      .replace(/\s+/g, ' ').replace(/\s+\./g, '.').replace(/\s+,/g, ',').trim();
  }

  // 2. Nettoyage du resume global
  if (parsed.resume) {
    parsed.resume = parsed.resume
      .replace(/\(\s*\d+[,.]?\d*\s*€\/m²\s*(vs|>)\s*\d+[,.]?\d*\s*€\/m²[^)]*\)/gi, '')
      .replace(/\s*\(?selon\s+(la\s+grille|l[' ]arr[eê]t[eé])[^,.)]*\)?[,.]?\s*/gi, ' ')
      .replace(/\s*\(?grille\s+(de|d[' ]encadrement|pref[eé]ctorale)[^,.)]*\)?[,.]?\s*/gi, ' ')
      .replace(/\s*secteur\s+\d+[,.]?\s*/gi, ' ')
      .replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  }

  // 3. Garde-fou metier : si on a loyer/m2 reel ET plafond detecte (de Claude ou grille),
  //    on force le statut a partir des vrais chiffres hors charges.
  if (loyerM2 !== null && parsed.loyer && parsed.loyer.plafond) {
    // Extrait le plafond numerique du champ texte (ex: "14€/m²" -> 14, "1246,00 €" -> 1246)
    // Si on a deja plafond_m2 (calcule depuis grille), on le prend, sinon on extrait
    var plafondNum;
    if (parsed.loyer.plafond_m2) {
      var pm = String(parsed.loyer.plafond_m2).match(/(\d+[,.]?\d*)/);
      plafondNum = pm ? parseFloat(pm[1].replace(',', '.')) : null;
    } else {
      var plafondMatch = String(parsed.loyer.plafond).match(/(\d+[,.]?\d*)/);
      plafondNum = plafondMatch ? parseFloat(plafondMatch[1].replace(',', '.')) : null;
    }
    if (plafondNum !== null && plafondNum > 0) {
      // Si plafondNum est un loyer mensuel (issu de Claude, format "1246 €"), on le convertit en /m2
      var seuilM2 = plafondNum;
      if (seuilM2 > 100 && surface > 0) seuilM2 = plafondNum / surface;
      // Tolerance de 0.01 pour les arrondis
      if (loyerM2 <= seuilM2 + 0.01) {
        if (parsed.loyer.statut === 'danger' || parsed.loyer.statut === 'warning') {
          parsed.loyer.statut = 'ok';
          parsed.loyer.trop_percu = null;
          parsed.loyer.exedent_mensuel = null;
          if (parsed.resume) {
            parsed.resume = parsed.resume
              .replace(/loyer\s+sup[eé]rieur\s+au\s+plafond\s+l[eé]gal\s+d[' ]?encadrement\s*,?\s*/gi, '')
              .replace(/d[eé]passement\s+(significatif|du\s+plafond)[^,.]*[,.]?\s*/gi, '')
              .replace(/loyer\s+(non\s+conforme|illegal|excessif)\s+au?\s*plafond[^,.]*[,.]?\s*/gi, '')
              .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s+/g, ' ')
              .replace(/:\s*,/g, ':').replace(/\s+\./g, '.').trim();
            parsed.resume = parsed.resume.replace(/^[^a-zA-Z0-9À-ÿ]*/, '').trim();
          }
        }
      } else {
        var exedentReel = Math.round((loyerM2 - seuilM2) * surface * 100) / 100;
        if (exedentReel > 0) {
          parsed.loyer.exedent_mensuel = exedentReel;
        }
      }
    }
  }

  return parsed;
}
 
function buildLetterPrompt(letterType, analysisData, context) {
  var labels = {
    // Lettres "litige" (existantes — directement liees aux clauses illegales detectees)
    proprio: "au proprietaire pour demander la suppression des clauses illegales",
    agence: "a l'agence immobiliere pour signaler les clauses illegales",
    miseendemeure: "de mise en demeure formelle avant saisine de la conciliation",
    remboursement: "de demande de remboursement du trop-percu de loyer",
    conciliation: "de saisine de la Commission Departementale de Conciliation",
    // Lettres "vie du bail" (nouvelles — utilisables a tout moment pendant ou apres le bail)
    preavis_depart: "de notification de preavis de depart au bailleur, conformement a l'article 15 de la loi du 6 juillet 1989",
    restitution_depot: "de demande de restitution du depot de garantie, conformement a l'article 22 de la loi du 6 juillet 1989 (delai 1 ou 2 mois apres remise des cles selon EDL conforme ou non)",
    contestation_irl: "de contestation de la revision annuelle du loyer (IRL) en cas d'erreur de calcul, d'indice incorrect ou de non-respect du delai d'un an",
    reparations_urgentes: "de mise en demeure du bailleur d'effectuer les reparations a sa charge, conformement a l'article 6 de la loi du 6 juillet 1989 et au decret n. 87-712 du 26 aout 1987",
    contestation_edl: "de contestation de l'etat des lieux de sortie en cas de degradations contestees, vetuste invoquee, ou non-respect des regles d'amortissement",
    attestation_loyer: "de demande d'attestation de loyer au bailleur (necessaire pour dossier CAF, employeur, banque, administration)",
    changement_adresse: "de notification au bailleur d'un changement d'adresse ou de coordonnees du locataire"
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

  // Instructions specifiques selon le type de lettre
  var specifInstructions = '';
  if (letterType === 'preavis_depart') {
    var bienType = (context && context.type_bien) || 'vide';
    var ville = (context && context.ville) || '';
    var encadre = isVilleEncadree(ville);
    var preavisDuree = (bienType === 'meuble' || encadre) ? '1 mois' : '3 mois';
    specifInstructions = "\n=== SPECIFIQUE PREAVIS DE DEPART ===\n"
      + "- Duree de preavis applicable : " + preavisDuree + " (logement " + bienType + (encadre ? ', zone tendue/encadree' : ', hors zone tendue') + ')'
      + "\n- Inviter le bailleur a convenir d'un EDL de sortie\n"
      + "- Rappeler le delai legal de restitution du depot (1 mois si EDL conforme, 2 mois sinon)\n"
      + "- Date de depart envisagee : indiquer une date approximative (la lettre devra etre completee par le locataire)\n"
      + "- Ton : courtois et professionnel (ce n'est PAS un litige)\n"
      + "=== FIN SPECIFIQUE ===\n";
  } else if (letterType === 'restitution_depot') {
    specifInstructions = "\n=== SPECIFIQUE RESTITUTION DEPOT ===\n"
      + "- Citer l'article 22 de la loi du 6 juillet 1989 (delai 1 mois si EDL conforme, 2 mois sinon)\n"
      + "- Penalites de retard : 10% du loyer mensuel hors charges par mois de retard\n"
      + "- Mentionner la date de restitution des cles\n"
      + "- Exiger la restitution sous 15 jours avec calcul des penalites si delai depasse\n"
      + "- Indiquer recours possibles (Commission de conciliation, tribunal judiciaire)\n"
      + "=== FIN SPECIFIQUE ===\n";
  } else if (letterType === 'contestation_irl') {
    specifInstructions = "\n=== SPECIFIQUE CONTESTATION IRL ===\n"
      + "- Citer l'article 17-1 de la loi du 6 juillet 1989 (revision annuelle plafonnee a l'IRL INSEE)\n"
      + "- Rappeler la formule de calcul : (loyer ancien x nouvel IRL) / IRL de reference\n"
      + "- Demander au bailleur de fournir le calcul detaille et l'indice utilise\n"
      + "- Mentionner que la revision est CADUQUE si non notifiee dans un delai d'un an apres sa date d'effet (art. 17-1 II)\n"
      + "- Exiger le remboursement des sommes indument percues le cas echeant\n"
      + "=== FIN SPECIFIQUE ===\n";
  } else if (letterType === 'reparations_urgentes') {
    specifInstructions = "\n=== SPECIFIQUE REPARATIONS URGENTES ===\n"
      + "- Citer l'article 6 c) et d) de la loi du 6 juillet 1989 (obligations du bailleur : delivrer un logement decent, entretenir les locaux en etat de servir a l'usage prevu)\n"
      + "- Citer le decret n. 87-712 du 26 aout 1987 (repartition charges locatives vs bailleur)\n"
      + "- Decrire les desordres constates (laisser un placeholder a remplir par le locataire)\n"
      + "- Fixer un delai de 30 jours pour intervention du bailleur\n"
      + "- Mentionner les recours : consignation du loyer aupres de la CDC, saisine du tribunal judiciaire, ARS pour insalubrite\n"
      + "=== FIN SPECIFIQUE ===\n";
  } else if (letterType === 'contestation_edl') {
    specifInstructions = "\n=== SPECIFIQUE CONTESTATION EDL DE SORTIE ===\n"
      + "- Distinguer usure normale (a la charge du bailleur) et degradations (a la charge du locataire) — decret n. 87-712\n"
      + "- Rappeler la regle de vetuste (grille de vetuste applicable selon convention ou usage local)\n"
      + "- Contester l'absence d'EDL d'entree si applicable (Art. 1731 Code civil : presomption en faveur du locataire)\n"
      + "- Exiger justificatifs (devis, factures, photos datees) pour chaque retenue contestee\n"
      + "- Demander la restitution integrale du depot ou la communication des justificatifs sous 15 jours\n"
      + "=== FIN SPECIFIQUE ===\n";
  } else if (letterType === 'attestation_loyer') {
    specifInstructions = "\n=== SPECIFIQUE ATTESTATION DE LOYER ===\n"
      + "- Demande administrative simple, ton courtois\n"
      + "- Preciser l'usage (CAF, employeur, banque, administration)\n"
      + "- Demander les informations : montant loyer hors charges, charges, type de logement (vide/meuble), date debut bail, regularite des paiements\n"
      + "- Fixer un delai de 15 jours pour reponse\n"
      + "- Pas de menace de recours (c'est une demande, pas un litige)\n"
      + "=== FIN SPECIFIQUE ===\n";
  } else if (letterType === 'changement_adresse') {
    specifInstructions = "\n=== SPECIFIQUE CHANGEMENT ADRESSE ===\n"
      + "- Notifier la nouvelle adresse postale du locataire (apres demenagement)\n"
      + "- Rappeler les coordonnees du logement loue (qui n'a pas change)\n"
      + "- Indiquer la date d'effet du changement\n"
      + "- Ton purement administratif\n"
      + "=== FIN SPECIFIQUE ===\n";
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
    + specifInstructions
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

// ─────────────────────────────────────────────────────────────
// RECHERCHE WEB DE LA GRILLE D'ENCADREMENT (fallback dynamique)
// Quand la ville n'est pas dans le JSON local, on declenche une
// recherche internet ciblee via le tool web_search d'Anthropic.
// Cache memoire par instance Vercel (TTL 24h par ville).
// ─────────────────────────────────────────────────────────────
var GRILLES_WEB_CACHE = {};
var GRILLES_WEB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function searchGrilleViaWeb(ville, nbPieces, typeBien) {
  if (!ville) return null;
  var cacheKey = String(ville).toLowerCase().trim() + '|' + (nbPieces || 1) + '|' + (typeBien || 'vide');
  var cached = GRILLES_WEB_CACHE[cacheKey];
  if (cached && (Date.now() - cached.ts) < GRILLES_WEB_CACHE_TTL_MS) {
    console.log('[grilles-web] HIT cache pour', cacheKey);
    return cached.data;
  }

  try {
    var promptWeb = "Recherche sur internet les references actuelles d'encadrement des loyers (arrete prefectoral ou observatoire local) pour la commune de \"" + ville + "\" en France, en vigueur en 2025-2026.\n\n"
      + "Logement de reference : " + (nbPieces || 1) + " piece(s), " + (typeBien || 'vide') + ".\n\n"
      + "Cherche les valeurs en euros/m2 hors charges :\n"
      + "- loyer de reference (mediane)\n"
      + "- loyer de reference majore (plafond legal opposable si encadrement strict, ou repere haut du marche sinon)\n"
      + "- loyer de reference minore (repere bas)\n\n"
      + "Si la ville est en zone tendue mais sans encadrement strict applique : donne les valeurs medianes du marche locatif local d'apres l'OLPL ou observatoire equivalent.\n"
      + "Si la ville est rurale ou tres petite : donne une estimation prudente basee sur le departement.\n\n"
      + "Reponds STRICTEMENT en JSON, sans markdown, sans texte avant ou apres :\n"
      + "{\"plafond_m2\": NUM, \"ref_m2\": NUM, \"minore_m2\": NUM, \"encadrement_strict\": BOOL, \"source\": \"url ou nom de source\", \"confiance\": \"haute|moyenne|faible\"}\n\n"
      + "Si tu ne trouves AUCUNE donnee fiable, reponds : {\"plafond_m2\": null}";

    var response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        tools: [{ "type": "web_search_20250305", "name": "web_search", "max_uses": 3 }],
        messages: [{ role: "user", content: promptWeb }]
      })
    });

    if (!response.ok) {
      console.warn('[grilles-web] API echec', response.status);
      return null;
    }
    var data = await response.json();

    // Extraire le texte (peut contenir des blocs tool_use intercales)
    var txt = '';
    for (var i = 0; i < (data.content || []).length; i++) {
      if (data.content[i].type === 'text') txt += data.content[i].text;
    }
    var jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[grilles-web] Pas de JSON dans la reponse pour', ville);
      return null;
    }
    var parsed;
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch (e) {
      console.warn('[grilles-web] JSON invalide pour', ville, ':', e.message);
      return null;
    }
    if (typeof parsed.plafond_m2 !== 'number' || parsed.plafond_m2 <= 0) {
      console.log('[grilles-web] Pas de plafond trouve pour', ville);
      GRILLES_WEB_CACHE[cacheKey] = { ts: Date.now(), data: null };
      return null;
    }

    var result = {
      plafond_m2: parsed.plafond_m2,
      ref_m2: typeof parsed.ref_m2 === 'number' && parsed.ref_m2 > 0 ? parsed.ref_m2 : parsed.plafond_m2 * 0.83,
      minore_m2: typeof parsed.minore_m2 === 'number' && parsed.minore_m2 > 0 ? parsed.minore_m2 : parsed.plafond_m2 * 0.67,
      encadrement_actif: parsed.encadrement_strict === true,
      indicatif: parsed.encadrement_strict !== true,
      type: typeBien || 'vide',
      epoque: 'apres1990',
      secteur: '1',
      ville: String(ville).toLowerCase(),
      source: 'recherche_web: ' + (parsed.source || 'sources publiques'),
      confiance: parsed.confiance || 'moyenne',
      _from_web: true
    };
    GRILLES_WEB_CACHE[cacheKey] = { ts: Date.now(), data: result };
    console.log('[grilles-web] OK', ville, '→ plafond_m2:', result.plafond_m2, 'source:', result.source);
    return result;
  } catch (e) {
    console.error('[grilles-web] Erreur:', e && e.message);
    return null;
  }
}

/**
 * Resout le plafond pour une ville :
 * 1) Grille locale (JSON embarque) — rapide
 * 2) Recherche web Anthropic — si grille locale absente
 * Le resultat est ensuite mis en cache (memoire) pour 24h.
 */
async function resolveLoyerPlafond(opts) {
  var local = getLoyerPlafond(opts);
  if (local) return local;
  if (!opts || !opts.ville) return null;
  console.log('[grilles] Grille locale absente pour', opts.ville, '→ recherche web');
  return await searchGrilleViaWeb(opts.ville, opts.nbPieces, opts.typeBien);
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

    // ────────────────────────────────────────────────────────────
    // RESOLUTION DU PLAFOND (grille locale puis recherche web si besoin)
    // On effectue cette resolution AVANT de construire les prompts pour que
    // buildSystemPrompt / buildBailPrompt / sanitizeAnalysis l'utilisent.
    // ────────────────────────────────────────────────────────────
    if (type === 'bail' && context.ville && context.loyer_base && context.surface) {
      try {
        var plafondResolved = await resolveLoyerPlafond({
          ville: context.ville,
          nbPieces: context.nb_pieces || estimateNbPieces(context.surface),
          epoque: devineEpoque(context.annee_construction),
          typeBien: context.type_bien || 'vide',
          quartier: context.quartier || context.ville
        });
        if (plafondResolved) {
          context._plafondInfo = plafondResolved;
          console.log('[grilles] Plafond resolu pour', context.ville, '→', plafondResolved.plafond_m2, '€/m² (' + (plafondResolved._from_web ? 'web' : 'local') + ')');
        }
      } catch (e) {
        console.warn('[grilles] Echec resolution plafond:', e && e.message);
      }
    }

    var systemPrompt = buildSystemPrompt(context);
    var analysisPrompt = type === 'etat'
      ? buildEtatDesLieuxPrompt(context)
      : buildBailPrompt(context, extraDocs);
 
    // Tokens adaptatifs :
    // - mode normal : 1800
    // - extra_docs : 2800
    // - skip_form (extraction auto) : 2500 (besoin de place pour context_extrait)
    // - extra_docs + skip_form : 3200
    var maxTokensAnalysis = 1800;
    if (extraDocs.length > 0) maxTokensAnalysis = 2800;
    if (context && context._skip_form) maxTokensAnalysis = Math.max(maxTokensAnalysis, 2500);
    if (extraDocs.length > 0 && context && context._skip_form) maxTokensAnalysis = 3200;
 
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
      console.error('[parse] JSON parse error. RawText preview:', rawText.slice(0, 800));
      console.error('[parse] Erreur:', e && e.message);
      // ────────────────────────────────────────────────────────
      // PARSING TOLERANT : si le JSON est tronque, on tente de
      // recuperer ce qu'on peut avant de retomber sur le fallback.
      // ────────────────────────────────────────────────────────
      try {
        var clean2 = rawText.replace(/```json/g, '').replace(/```/g, '');
        var fb = clean2.indexOf('{');
        if (fb !== -1) {
          // Tronque a la derniere virgule ou accolade complete trouvee
          var attempt = clean2.slice(fb);
          // Essai 1 : fermer toutes les structures ouvertes
          var openBraces = (attempt.match(/\{/g) || []).length;
          var closeBraces = (attempt.match(/\}/g) || []).length;
          var openBrackets = (attempt.match(/\[/g) || []).length;
          var closeBrackets = (attempt.match(/\]/g) || []).length;
          // Retirer trailing commas + ajouter fermetures manquantes
          attempt = attempt.replace(/,\s*$/, '');
          for (var i = 0; i < (openBrackets - closeBrackets); i++) attempt += ']';
          for (var j = 0; j < (openBraces - closeBraces); j++) attempt += '}';
          parsed = JSON.parse(attempt);
          console.log('[parse] Recuperation JSON tronque reussie');
        } else {
          throw e;
        }
      } catch (e2) {
        // Message d'erreur contextuel selon le mode
        var skipForm = context && context._skip_form;
        var errMsg = skipForm
          ? "L'extraction automatique du bail n'a pas abouti. Essayez de revenir au formulaire et de saisir manuellement les informations (ville, loyer, surface)."
          : "L'analyse a rencontre un probleme de formatage. Essayez de coller le texte de votre bail manuellement.";
        return res.status(200).json({
          score: 50, verdict: 'Risque',
          verdict_titre: 'Analyse partielle',
          resume: errMsg,
          loyer: null, clauses_abusives: [],
          plan_action: skipForm
            ? ['Revenir en arriere et cliquer sur "Continuer → Logement"', 'Saisir les informations manuellement', 'Relancer l\'analyse']
            : ['Reessayer en collant le texte du bail dans le champ texte'],
          _partial: true,
          _skip_form_failed: skipForm || false
        });
      }
    }

    // FILET DE SECURITE : on neutralise tout faux positif d'encadrement
    // base sur les charges, et on impose le calcul officiel hors charges.
    parsed = sanitizeAnalysis(parsed, context);
 
    // ─── Persistance Supabase (non-bloquant, RGPD-safe) ──────────────
    // On enregistre uniquement les metadonnees + le resultat structure.
    // On NE STOCKE PAS le texte brut du bail (PII).
    // On attend la reponse pour recuperer l'id et le renvoyer au frontend
    // (necessaire pour relier le futur paiement Stripe a cette analyse).
    var analysisId = null;
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        var sbResp = await fetch(process.env.SUPABASE_URL + '/rest/v1/b2c_analyses', {
          method: 'POST',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            type_analyse: context.type_analyse || 'bail',
            ville: context.ville || null,
            surface: context.surface ? parseFloat(context.surface) : null,
            loyer_base: context.loyer_base ? parseFloat(context.loyer_base) : null,
            type_bien: context.type_bien || null,
            type_location: context.type_location || null,
            score: typeof parsed.score === 'number' ? parsed.score : null,
            verdict: parsed.verdict || null,
            nb_clauses_abusives: (parsed.clauses_abusives && parsed.clauses_abusives.length) || 0,
            loyer_m2: computeLoyerM2(context),
            ville_encadree: isVilleEncadree(context.ville),
            has_extra_docs: extraDocs.length > 0,
            input_mode: body.pdf ? 'pdf' : 'text',
            result_json: parsed
          })
        });
        if (sbResp.ok) {
          var inserted = await sbResp.json();
          if (Array.isArray(inserted) && inserted[0] && inserted[0].id) {
            analysisId = inserted[0].id;
          }
        } else {
          console.error('Supabase insert failed:', sbResp.status, await sbResp.text());
        }
      }
    } catch (persistErr) {
      console.error('Supabase persist error (non-blocking):', persistErr && persistErr.message);
    }
 
    // On expose l'analysisId au frontend pour qu'il puisse le passer a Stripe Checkout
    if (analysisId) parsed._analysis_id = analysisId;
 
    return res.status(200).json(parsed);
 
  } catch (error) {
    console.error('BailScan error:', error);
    return res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
};
