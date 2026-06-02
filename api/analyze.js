// BailScan — API analyze.js
// CommonJS pur — compatible Vercel sans type:module

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
// Analyse principale = Opus sur TOUTES les analyses (upload bail, texte, formulaire).
// Opus = meilleur raisonnement juridique et moins de faux positifs que Sonnet.
const MODEL = process.env.BAILSCAN_MODEL || "claude-opus-4-8";
// Modele de repli si Opus est momentanement indisponible (rate limit / incident).
const FALLBACK_MODEL = "claude-sonnet-4-20250514";
// Modele dedie a l'EXTRACTION (lecture du document, souvent scanne/manuscrit).
// Opus lit l'ecriture manuscrite et les scans nettement mieux que Sonnet.
const EXTRACT_MODEL = process.env.BAILSCAN_EXTRACT_MODEL || "claude-opus-4-8";

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

// ── Encadrement PRECISION QUARTIER (adresse -> geocodage BAN -> polygone) ──
// Agnostique a la ville. AJOUTER UNE VILLE = (1) deposer api/data/<ville>-loyers.json
// (genere par build-loyers.js) ; (2) decommenter sa ligne require ci-dessous.
// NB : requires STATIQUES obligatoires (traces par le bundler Vercel ; un require
// dynamique ./data/ + variable ne serait PAS inclus dans le deploiement).
var QUARTIER_ENGINE = null;
function getQuartierEngine() {
  if (QUARTIER_ENGINE) return QUARTIER_ENGINE;
  try { QUARTIER_ENGINE = require('./paris-loyers-engine.js'); }
  catch (e) { console.warn('[quartier] moteur absent:', e && e.message); QUARTIER_ENGINE = null; }
  return QUARTIER_ENGINE;
}
var QUARTIER_DATA_CACHE = {};
function getQuartierData(villeKey) {
  if (Object.prototype.hasOwnProperty.call(QUARTIER_DATA_CACHE, villeKey)) return QUARTIER_DATA_CACHE[villeKey];
  var d = null;
  try {
    if (villeKey === 'paris') d = require('./data/paris-loyers.json');
    else if (villeKey === 'lyon') d = require('./data/lyon-loyers.json');
    else if (villeKey === 'lille') d = require('./data/lille-loyers.json');
    else if (villeKey === 'bordeaux') d = require('./data/bordeaux-loyers.json');
    else if (villeKey === 'montpellier') d = require('./data/montpellier-loyers.json');
    else if (villeKey === 'grenoble') d = require('./data/grenoble-loyers.json');
    // else if (villeKey === 'bayonne') d = require('./data/bayonne-loyers.json');
    else if (villeKey === 'plaine-commune') d = require('./data/plaine-commune-loyers.json');
    else if (villeKey === 'est-ensemble') d = require('./data/est-ensemble-loyers.json');
  } catch (e) { d = null; }
  if (d) console.log('[quartier] data', villeKey, 'OK -', (d.quartiers || []).length, 'quartiers, annee', d.annee);
  QUARTIER_DATA_CACHE[villeKey] = d;
  return d;
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
  if (/(saint-denis|aubervilliers|courneuve|epinay-sur-seine|pierrefitte|villetaneuse|ile-saint-denis|stains|saint-ouen)/.test(v)) return 'plaine-commune';
  if (/(montreuil|pantin|bagnolet|bobigny|bondy|lilas|pre-saint-gervais|noisy-le-sec|romainville)/.test(v)) return 'est-ensemble';
  if (/(echirolles|saint-martin-d.heres|la tronche|la-tronche|meylan|eybens|gieres|seyssins|seyssinet|pont-de-claix|saint-egreve|sassenage|domene|murianette|venon|poisat|bresson|claix|varces|fontanil|fontaine)/.test(v)) return 'grenoble';
  if (/(arcangues|biarritz|bidart|guethary|saint-jean-de-luz|ahetze|arbonne|ascain|bassussarry|urrugne|biriatou|boucau|hendaye|jatxou|lahonce|larressore|mouguerre|saint-pierre-d.irube|urcuit|ustaritz|villefranque|anglet|bayonne|ciboure)/.test(v)) return 'pays-basque';
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
  if (v.indexOf('biarritz') >= 0 || v.indexOf('bayonne') >= 0 || v.indexOf('anglet') >= 0) return 'pays-basque';
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
  var cpMatch = q.match(/\b(\d{5})\b/);
  var cp = cpMatch ? cpMatch[1] : null;

  if (villeKey === 'paris') {
    // Secteurs avec donnees dans la grille : 1 (prestige), 5 (mid), 11 (nord/est).
    var arr = null;
    if (cp && cp.indexOf('75') === 0) arr = parseInt(cp.slice(-2), 10);
    if (!arr) { var mp = q.match(/\b(\d{1,2})\s*(?:er|e|eme|ème|arr)/); if (mp) arr = parseInt(mp[1], 10); }
    if (arr) {
      if ([1,2,3,4,5,6,7,8,9,16].indexOf(arr) !== -1) return '1';
      if ([10,11,12,15,17].indexOf(arr) !== -1) return '5';
      if ([13,14,18,19,20].indexOf(arr) !== -1) return '11';
    }
    // defaut conservateur : plafond le plus haut (ne jamais fabriquer de depassement)
    return '1';
  }

  if (villeKey === 'lyon') {
    // Secteurs grille : 1 (1/2/6e), 2 (3/4/7/9e), 3 (5/8e + Villeurbanne), 4 (Villeurbanne hors centre)
    if (cp === '69100' || /villeurbanne/.test(q)) return '3';
    var larr = null;
    if (cp && cp.indexOf('69') === 0) larr = parseInt(cp.slice(-2), 10);
    if (!larr) { var ml = q.match(/\b(\d)\s*(?:er|e|eme|ème|arr)/); if (ml) larr = parseInt(ml[1], 10); }
    if (larr) {
      if ([1,2,6].indexOf(larr) !== -1) return '1';
      if ([3,4,7,9].indexOf(larr) !== -1) return '2';
      if ([5,8].indexOf(larr) !== -1) return '3';
    }
    return '1';
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

  // Ville a selecteur de zone (ex Lille) SANS zone fournie -> moyenne sur toutes les zones (estimation)
  var _explicitZone = opts && opts.zone != null && String(opts.zone).trim() !== '' && conf.loyers[String(opts.zone).trim()];
  if (conf.zone_selector && !_explicitZone) {
    var npz = Math.min(Math.max(parseInt((opts && opts.nbPieces) || 1, 10), 1), 4);
    var tkz = (opts && opts.typeBien && /meubl/i.test(opts.typeBien)) ? 'meuble' : 'vide';
    var epsz = (!(opts && opts.epoque) || opts.epoque === 'moyenne') ? ['avant1946', '1946-70', '1971-90', 'apres1990'] : [opts.epoque];
    var rowsz = [];
    Object.keys(conf.loyers).forEach(function (sec) {
      epsz.forEach(function (e) { var en = conf.loyers[sec][npz + '_' + e + '_' + tkz]; if (en) rowsz.push(en); });
    });
    if (rowsz.length) {
      var sMz = 0, sRz = 0, smz = 0; rowsz.forEach(function (en) { sMz += en.majore; sRz += en.ref; smz += en.minore; });
      var nz = rowsz.length;
      return {
        plafond_m2: Math.round(sMz / nz * 10) / 10, ref_m2: Math.round(sRz / nz * 10) / 10, minore_m2: Math.round(smz / nz * 10) / 10,
        type: tkz, epoque: 'moyenne', secteur: 'toutes', ville: villeKey,
        encadrement_actif: conf.encadrement_actif === true, indicatif: conf.type === 'indicatif',
        estimation: true, estimation_note: (epsz.length > 1 ? 'zone et epoque non precisees — moyenne' : 'zone non precisee — moyenne des zones'),
        source: 'Grille ' + villeKey + ' ' + (conf.annee || '') + ' (moyenne des zones)',
        disclaimer: grilles._meta && grilles._meta.disclaimer
      };
    }
  }

  // 3) Choix du secteur (avec fallback sur le premier dispo)
  var secteur = devineSecteur(villeKey, opts && opts.quartier);
  // Zone fournie explicitement (sélecteur de zone, ex Lille où le code postal ne distingue pas les zones)
  if (opts && opts.zone != null && String(opts.zone).trim() !== '' && conf.loyers[String(opts.zone).trim()]) {
    secteur = String(opts.zone).trim();
  }
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
  var typeKey = (opts && opts.typeBien && /meubl/i.test(opts.typeBien)) ? 'meuble' : 'vide';
  var altType = typeKey === 'meuble' ? 'vide' : 'meuble';
  // Epoque inconnue (null/'moyenne') -> moyenne des epoques au lieu de deviner apres1990
  var avgEpoque = !(opts && opts.epoque) || opts.epoque === 'moyenne';
  if (avgEpoque) {
    var EPS = ['apres1990', '1971-90', '1946-70', 'avant1946'];
    var aggT = typeKey, rowsA = [];
    EPS.forEach(function (e) { var en = secteurData[np + '_' + e + '_' + typeKey]; if (en) rowsA.push(en); });
    if (!rowsA.length) { aggT = altType; EPS.forEach(function (e) { var en = secteurData[np + '_' + e + '_' + altType]; if (en) rowsA.push(en); }); }
    if (rowsA.length) {
      var sM = 0, sR = 0, sm = 0; rowsA.forEach(function (en) { sM += en.majore; sR += en.ref; sm += en.minore; });
      var nA = rowsA.length;
      console.log('[grilles] Moyenne epoques', villeKey, 'secteur', secteur, '(' + nA + ')');
      return {
        plafond_m2: Math.round(sM / nA * 10) / 10, ref_m2: Math.round(sR / nA * 10) / 10, minore_m2: Math.round(sm / nA * 10) / 10,
        type: aggT, epoque: 'moyenne', secteur: secteur, ville: villeKey,
        encadrement_actif: conf.encadrement_actif === true, indicatif: conf.type === 'indicatif',
        estimation: true, estimation_note: 'epoque de construction non renseignee — moyenne des epoques',
        source: 'Grille ' + villeKey + ' ' + (conf.annee || '2025') + ' secteur ' + secteur,
        disclaimer: grilles._meta && grilles._meta.disclaimer
      };
    }
  }
  var epoque = (opts && opts.epoque) || 'apres1990';

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

// Communes en encadrement des loyers STRICT (plafond opposable), ~69 communes
// sur 9-10 territoires. A reverifier sur encadrementdesloyers.gouv.fr (la liste s'etend).
// NB : Lyon/Villeurbanne ont connu des episodes de suspension judiciaire — le simulateur
// officiel reste la source de verite ; on prefere ici inclure et renvoyer vers l'officiel.
const VILLES_ENCADREMENT = [
  // Paris
  "paris",
  // Lille (uniquement Lille + communes associees, PAS Roubaix/Tourcoing)
  "lille", "hellemmes", "lomme",
  // Plaine Commune (9)
  "saint-denis", "aubervilliers", "epinay-sur-seine", "ile-saint-denis",
  "la courneuve", "courneuve", "pierrefitte", "saint-ouen", "stains", "villetaneuse",
  // Lyon Metropole
  "lyon", "villeurbanne",
  // Est Ensemble (9)
  "bagnolet", "bobigny", "bondy", "pre-saint-gervais", "les lilas",
  "montreuil", "noisy-le-sec", "pantin", "romainville",
  // Montpellier
  "montpellier",
  // Bordeaux
  "bordeaux",
  // Pays Basque (principales communes encadrees)
  "bayonne", "anglet", "biarritz", "bidart", "guethary", "saint-jean-de-luz",
  "ciboure", "urrugne", "hendaye", "boucau", "bassussarry", "arcangues", "arbonne",
  "ahetze", "saint-pierre-d'irube", "mouguerre", "villefranque", "ustaritz",
  "cambo-les-bains", "espelette", "larressore", "jatxou", "halsou",
  // Grenoble-Alpes Metropole (communes integralement ou partiellement encadrees)
  "grenoble", "echirolles", "saint-martin-d'heres", "fontaine", "sassenage",
  "saint-egreve", "seyssinet-pariset", "seyssins", "pont-de-claix", "la tronche",
  "meylan", "domene", "murianette", "venon", "gieres", "eybens", "poisat",
  "bresson", "claix", "varces", "fontanil"
];
 
function isVilleEncadree(ville) {
  if (!ville) return false;
  return VILLES_ENCADREMENT.some(function(v) { return ville.toLowerCase().includes(v); });
}

// ─────────────────────────────────────────────────────────────
// ZONE TENDUE (pour le PREAVIS reduit a 1 mois + encadrement de
// l'EVOLUTION du loyer a la relocation). Perimetre = les 28 agglomerations
// du "1°" de l'art. 232 CGI (decret 2013-392), PAS la liste TLV elargie
// (3690 communes) de 2023 qui ne concerne que la taxe.
// Cle = code postal (extrait du formulaire/bail). Liste des principales
// communes des 28 agglos ; le reste retombe sur "a verifier" (jamais d'affirmation fausse).
// Surchargeable via ./data/zone-tendue.json (tableau de codes postaux).
// ─────────────────────────────────────────────────────────────
var ZONE_TENDUE_CP = new Set([
  // Paris + petite couronne (unite urbaine de Paris)
  "75001","75002","75003","75004","75005","75006","75007","75008","75009","75010",
  "75011","75012","75013","75014","75015","75016","75017","75018","75019","75020",
  "92100","92110","92120","92130","92140","92150","92160","92170","92190","92200",
  "92210","92220","92230","92240","92250","92260","92270","92290","92300","92310",
  "92320","92330","92340","92350","92360","92370","92380","92390","92400","92410",
  "92420","92500","92600","92700","92800","93100","93110","93120","93130","93140",
  "93150","93160","93170","93190","93200","93210","93220","93230","93240","93250",
  "93260","93270","93290","93300","93310","93320","93330","93340","93350","93370",
  "93380","93390","93400","93410","93420","93430","93440","93450","93460","93470",
  "93500","93600","93700","93800","94100","94110","94120","94130","94140","94150",
  "94160","94170","94190","94200","94210","94220","94230","94240","94250","94260",
  "94270","94290","94300","94310","94320","94340","94350","94360","94370","94380",
  "94400","94410","94420","94430","94440","94450","94460","94470","94480","94500",
  "94510","94520","94550","94600","94700","94800",
  // Lyon / Villeurbanne agglo
  "69001","69002","69003","69004","69005","69006","69007","69008","69009",
  "69100","69120","69140","69150","69160","69200","69300","69310","69320","69500","69600","69800",
  // Aix-Marseille
  "13001","13002","13003","13004","13005","13006","13007","13008","13009","13010",
  "13011","13012","13013","13014","13015","13016","13080","13090","13098","13100",
  "13290","13400","13600","13700","13127","13170","13380","13320","13880",
  // Lille agglo
  "59000","59160","59260","59800","59100","59200","59491","59493","59650","59700","59370","59290","59320",
  // Bordeaux agglo
  "33000","33100","33200","33300","33800","33700","33600","33400","33130","33150","33310","33270","33170","33140","33530",
  // Nice / Cote d'Azur
  "06000","06100","06200","06300","06600","06700","06800","06150","06160","06400","06110","06340",
  // Toulon agglo
  "83000","83100","83130","83140","83160","83190","83200","83500",
  // Strasbourg
  "67000","67100","67200","67300","67400","67800","67114","67540","67550","67640",
  // Nantes agglo
  "44000","44100","44200","44300","44400","44600","44800","44700","44230","44240","44470","44980",
  // Montpellier agglo
  "34000","34070","34080","34090","34170","34430","34250","34970","34920",
  // Bayonne / Pays Basque cote
  "64100","64200","64600","64500","64210","64480","64990","64700","64122",
  // La Rochelle
  "17000","17140","17180","17440",
  // Annecy
  "74000","74600","74940","74960","74370","74330",
  // Bassin d'Arcachon
  "33120","33260","33470","33510","33380","33980",
  // Ajaccio
  "20000","20090","20167","20166",
  // Bastia
  "20200","20600","20620",
  // Arles
  "13200","13280","13990","13104","13123","13129",
  // Beauvais
  "60000",
  // Draguignan
  "83300","83550",
  // Frejus / Saint-Raphael
  "83600","83370","83700",
  // Geneve-Annemasse
  "74100","74240","74380","74160","74240",
  // Meaux
  "77100","77124",
  // Menton
  "06500",
  // Saint-Nazaire
  "44600","44500","44550","44570",
  // Sete
  "34200",
  // Thonon-les-Bains
  "74200"
]);
var ZONE_TENDUE_CACHE = null;
function getZoneTendueSet() {
  if (ZONE_TENDUE_CACHE) return ZONE_TENDUE_CACHE;
  ZONE_TENDUE_CACHE = ZONE_TENDUE_CP;
  try {
    var extra = require('./data/zone-tendue.json'); // tableau de codes postaux officiels (optionnel)
    if (Array.isArray(extra)) { extra.forEach(function (cp) { ZONE_TENDUE_CACHE.add(String(cp).trim()); }); }
  } catch (e) { /* fichier optionnel absent : on garde la liste embarquee */ }
  return ZONE_TENDUE_CACHE;
}
// Retourne true / false / null(inconnu, hors liste -> a verifier)
function isZoneTendue(context) {
  var cp = (context && (context.code_postal || context.codePostal) || '').toString().trim();
  if (!/^\d{5}$/.test(cp)) return null; // pas de code postal fiable -> inconnu
  return getZoneTendueSet().has(cp) ? true : null; // hors liste -> inconnu (jamais "non" peremptoire)
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

// ────────────────────────────────────────────────────────────
// MOTEUR MONETAIRE DETERMINISTE
// Le modele ne produit AUCUN euro pour le loyer / depot / complement.
// Tous ces montants sont calcules ici, a partir des valeurs extraites.
// ────────────────────────────────────────────────────────────
function computeMoneyEngine(parsed, context) {
  var loyerBase  = parseFloat(context && context.loyer_base) || 0;
  var complement = parseFloat(context && context.complement_loyer) || 0;
  var justif     = ((context && context.complement_justif) || '').trim();
  var depot      = parseFloat(context && context.depot) || 0;
  var bienType   = (context && context.type_bien === 'meuble') ? 'meuble' : 'vide';
  var depotMoisMax = bienType === 'meuble' ? 2 : 1;
  var nbMois = parseInt(context && context.nb_mois_bail, 10);
  if (!(nbMois > 0)) nbMois = 0;

  // Loyer HORS CHARGES = loyer de base + complement (le complement fait partie du loyer)
  var loyerHC = Math.round((loyerBase + complement) * 100) / 100;

  // A) Trop-percu loyer vs plafond. UNIQUEMENT en zone d'encadrement strict :
  //    hors encadrement il n'existe aucun plafond legal opposable, donc aucun excedent
  //    "recuperable" (l'ecart au repere de marche est informatif, pas une violation).
  var encadrementStrict = !!(parsed.loyer && parsed.loyer.encadrement_strict);
  var exedentMensuel = (encadrementStrict && parsed.loyer && typeof parsed.loyer.exedent_mensuel === 'number' && parsed.loyer.exedent_mensuel > 0)
    ? parsed.loyer.exedent_mensuel : 0;
  var tropPercuLoyer = Math.round(exedentMensuel * nbMois * 100) / 100;

  // B) Complement de loyer non justifie (Art. 17-2). Un complement non justifie est
  //    retirable EN ENTIER, en plus d'un eventuel depassement du loyer de base sur le
  //    plafond. Les deux s'additionnent (ce ne sont pas les memes sommes).
  var complementInjustifie = false, complementRecuperable = 0;
  if (complement > 0 && justif.length < 15) {
    complementInjustifie = true;
    complementRecuperable = Math.round(complement * nbMois * 100) / 100;
  }

  // Excedent mensuel TOTAL recuperable cote loyer = depassement du loyer de base + complement non justifie
  var overpaymentMensuel = Math.round((exedentMensuel + (complementInjustifie ? complement : 0)) * 100) / 100;
  var recuperableLoyer = Math.round((tropPercuLoyer + complementRecuperable) * 100) / 100;

  // C) Depot de garantie excessif (sur loyer HORS CHARGES, base + complement inclus)
  var depotMax = Math.round(depotMoisMax * loyerHC * 100) / 100;
  var depotExcedent = (depot > 0 && loyerHC > 0 && depot > depotMax + 0.01)
    ? Math.round((depot - depotMax) * 100) / 100 : 0;

  return {
    nbMois: nbMois, loyerHC: loyerHC, depotMoisMax: depotMoisMax,
    exedentMensuel: exedentMensuel, tropPercuLoyer: tropPercuLoyer,
    overpaymentMensuel: overpaymentMensuel, recuperableLoyer: recuperableLoyer,
    complement: complement, complementInjustifie: complementInjustifie, complementRecuperable: complementRecuperable,
    depot: depot, depotMax: depotMax, depotExcedent: depotExcedent
  };
}

// ─────────────────────────────────────────────────────────────
// IRL (indice de reference des loyers), hexagone, base 100 = T4 1998.
// Source INSEE. A actualiser chaque trimestre, ou surcharger via
// api/data/irl.json { "latest": 146.60, "annees": { "2024": 145.17, ... } }.
// ─────────────────────────────────────────────────────────────
var IRL_LATEST = 146.60; // T1 2026
var IRL_PAR_ANNEE = { // valeur indicative annuelle (~T2) pour revaloriser un ancien loyer
  2017: 126.19, 2018: 127.77, 2019: 129.72, 2020: 130.57, 2021: 131.12,
  2022: 135.84, 2023: 140.59, 2024: 145.17, 2025: 146.68, 2026: 146.60
};
function _irlData() { try { return require('./data/irl.json') || null; } catch (e) { return null; } }
function getIrlLatest() { var d = _irlData(); return (d && d.latest) ? d.latest : IRL_LATEST; }
function irlAnnee(an) { var d = _irlData(); if (d && d.annees && d.annees[an]) return d.annees[an]; return IRL_PAR_ANNEE[an] || null; }

// ─────────────────────────────────────────────────────────────
// MODULE ZONE TENDUE : encadrement de l'EVOLUTION du loyer a la relocation.
// En zone tendue (hors encadrement strict, qui a son propre plafond opposable),
// le nouveau loyer ne peut pas depasser le dernier loyer du precedent locataire
// revalorise par l'IRL. Et le bail DOIT mentionner ce dernier loyer (art. 17 loi 1989).
// Exceptions au plafond : travaux importants, loyer manifestement sous-evalue, vacance > 18 mois.
// ─────────────────────────────────────────────────────────────
function computeRelocationZoneTendue(parsed, context) {
  var enZoneTendue = (isZoneTendue(context) === true);
  var encStrict = !!(parsed && parsed.loyer && parsed.loyer.encadrement_strict);
  if (!enZoneTendue || encStrict) return null; // hors zone tendue, ou encadrement strict (le plafond prime)

  var premiereLoc = !!(context && (context.premiere_location === true || context.premiere_location === 'true'));
  var newRent = parseFloat(context && context.loyer_base) || 0;
  var prevRent = parseFloat(context && context.loyer_precedent_locataire) || 0;
  var nbMois = parseInt(context && context.nb_mois_bail, 10); if (!(nbMois > 0)) nbMois = 0;

  var res = {
    applicable: true, premiere_location: premiereLoc, mention_presente: prevRent > 0,
    loyer_precedent: prevRent || null, plafond_relocation: null,
    excedent_mensuel: 0, recuperable: 0, estimation: false, note: ''
  };

  if (premiereLoc) {
    res.note = "Premiere mise en location (ou logement neuf / vacant > 18 mois) : le plafond a la relocation ne s'applique pas.";
    return res;
  }
  if (prevRent <= 0) {
    res.note = "Mention obligatoire absente : le bail ne precise pas le dernier loyer du precedent locataire.";
    return res;
  }

  var anRev = parseInt(context && context.annee_loyer_precedent, 10);
  var irlThen = (anRev && anRev > 2010 && anRev <= 2026) ? irlAnnee(anRev) : null;
  var factor = (irlThen && irlThen > 0) ? (getIrlLatest() / irlThen) : 1;
  if (!irlThen) res.estimation = true;
  var cap = Math.round(prevRent * factor * 100) / 100;
  res.plafond_relocation = cap;

  var excess = Math.round((newRent - cap) * 100) / 100;
  if (newRent > 0 && excess >= 1 && excess > cap * 0.01) {
    res.excedent_mensuel = excess;
    res.recuperable = Math.round(excess * nbMois * 100) / 100;
    res.note = res.estimation
      ? "Le loyer depasse l'ancien loyer revalorise (estimation IRL : precisez l'annee du dernier loyer pour un calcul exact)."
      : "Le loyer depasse le plafond a la relocation (ancien loyer revalorise par l'IRL).";
  } else {
    res.note = "Le loyer respecte le plafond a la relocation (ancien loyer revalorise par l'IRL).";
  }
  return res;
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
    zone: (context && context.encadrement_zone) || '',
    ville: ville,
    nbPieces: (context && context.nb_pieces) || estimateNbPieces(context && context.surface),
    epoque: (context && context.annee_construction) ? devineEpoque(context.annee_construction) : null,
    typeBien: bienType,
    quartier: (context && context.code_postal) || (context && context.quartier) || ville
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
    + "\n\nREGLES DE NOTATION (strictes) :\n"
    + "- 'verdict' DOIT etre exactement l'un de : \"Conforme\", \"Vigilance\", \"Risque\", \"Danger\". Aucun autre mot.\n"
    + "- Le score (0-100) reflete UNIQUEMENT les problemes REELLEMENT detectes dans les informations fournies. L'absence de bail uploade ne doit JAMAIS faire baisser le score : si seules les infos du formulaire sont fournies et qu'aucun probleme n'y apparait, le score reste eleve (>= 75) ; tu signales seulement dans 'resume' que l'analyse est partielle et invites a uploader le bail complet.\n"
    + "- Si la ville n'est PAS en zone d'encadrement, le niveau du loyer n'est JAMAIS un probleme : ne baisse pas le score pour cela, et indique clairement que la ville est 'hors encadrement des loyers'.\n"
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
    zone: (context && context.encadrement_zone) || '',
    ville: ville,
    nbPieces: (context && context.nb_pieces) || estimateNbPieces(surface),
    epoque: (context && context.annee_construction) ? devineEpoque(context.annee_construction) : null,
    typeBien: bienType,
    quartier: (context && context.code_postal) || (context && context.quartier) || ville
  });
 
  var extra = '';

  // ─────────────────────────────────────────────────────────────
  // MODE EXTRACTION AUTO : le user n'a pas rempli le formulaire,
  // Claude doit tout extraire du PDF du bail ET faire l'analyse
  // dans LE MEME appel (pour economiser les input tokens — rate limit).
  // ─────────────────────────────────────────────────────────────
  if (skipForm) {
    extra += "\n=== MODE EXTRACTION + ANALYSE (1 SEUL APPEL) ===\n"
      + "Le formulaire est VIDE. Lis le bail PDF attache et EN UN SEUL JSON :\n"
      + "1. Inclus un champ 'context_extrait' avec ville, surface, nb_pieces, annee_construction, loyer_base, charges, depot, type_bien, type_location, complement_loyer, complement_justif, date_debut_bail, nb_mois_bail, loyer_reference_majore, loyer_precedent_locataire, annee_loyer_precedent, premiere_location\n"
      + "   - loyer_reference_majore : si le bail mentionne un 'loyer de reference majore' en euros/m2 (zone d'encadrement), reporte ce nombre en euros/m2 (ex: 14.90). Sinon 0.\n"
      + "2. Fais l'analyse complete (score, verdict, clauses_abusives, etc.) en utilisant ces valeurs extraites\n"
      + "Date du jour pour calcul nb_mois_bail : " + new Date().toISOString().slice(0, 10) + "\n"
      + "Le champ 'context_extrait' est OBLIGATOIRE dans ton JSON. Format des valeurs : ville/strings sans accents speciaux ni guillemets, nombres en number.\n"
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

  var honoraires = parseFloat(context && context.honoraires_agence) || 0;
  if (honoraires > 0) {
    extra += "\nHonoraires d'agence factures au locataire : " + honoraires + " euros pour " + (surface || '?') + " m2. Plafond legal ALUR de la part locataire : 8 euros/m2 (zone non tendue), 10 euros/m2 (zone tendue), 12 euros/m2 (zone tres tendue), + 3 euros/m2 pour l'etat des lieux. Si le montant facture depasse ce plafond, l'EXCEDENT (montant facture - plafond applicable x surface) est recuperable : cree une clause 'danger' dediee et mets cet excedent dans son champ montant_recuperable.";
  }
  var fraisVisite = parseFloat(context && context.frais_visite) || 0;
  if (fraisVisite > 0) {
    extra += "\nFrais de visite/dossier separes factures au locataire : " + fraisVisite + " euros. Ils sont en principe inclus dans le plafond d'honoraires ALUR ; factures en plus, leur montant est recuperable : mets-le dans le montant_recuperable de la clause correspondante.";
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
    ? "{\"score\":75,\"verdict\":\"Risque\",\"verdict_titre\":\"3 problemes detectes\",\"resume\":\"Resume incluant les docs complementaires.\",\"loyer\":{\"statut\":\"ok\",\"analyse\":\"Analyse hors charges uniquement.\",\"plafond\":null,\"trop_percu\":null},\"clauses_abusives\":[{\"type\":\"danger\",\"titre\":\"Titre clause bail\",\"description\":\"Description.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. X loi 1989\"],\"action\":\"Action.\",\"montant_recuperable\":250},{\"type\":\"danger\",\"titre\":\"[Conge du bailleur] Vice de forme\",\"description\":\"Le conge ne respecte pas...\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. 15 loi 1989\"],\"action\":\"Contester le conge.\",\"montant_recuperable\":0}],\"plan_action\":[\"Etape 1\",\"Etape 2\",\"Etape 3\"]}"
    : "{\"score\":75,\"verdict\":\"Risque\",\"verdict_titre\":\"2 clauses a corriger\",\"resume\":\"Resume.\",\"loyer\":{\"statut\":\"ok\",\"analyse\":\"Analyse hors charges uniquement.\",\"plafond\":null,\"trop_percu\":null},\"clauses_abusives\":[{\"type\":\"danger\",\"titre\":\"Titre\",\"description\":\"Description.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Art. X loi 1989\"],\"action\":\"Action.\",\"montant_recuperable\":0}],\"plan_action\":[\"Etape 1\",\"Etape 2\",\"Etape 3\"]}";

  // En mode skip_form, ajouter le champ context_extrait au format
  if (skipForm) {
    formatExample = formatExample.replace(/\}$/, ',\"context_extrait\":{\"ville\":\"\",\"surface\":0,\"nb_pieces\":0,\"annee_construction\":0,\"loyer_base\":0,\"charges\":0,\"depot\":0,\"type_bien\":\"vide\",\"type_location\":\"principale\",\"complement_loyer\":0,\"complement_justif\":\"\",\"date_debut_bail\":\"\",\"nb_mois_bail\":0,\"loyer_reference_majore\":0,\"loyer_precedent_locataire\":0,\"annee_loyer_precedent\":0,\"premiere_location\":false}}');
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
    + "REGLE ABSOLUE SUR LES CHIFFRES — tu ne dois JAMAIS inventer, estimer, deduire ni arrondir un montant en euros. N'utilise QUE des montants ecrits noir sur blanc dans les documents fournis.\n"
    + "Pour CHAQUE clause de clauses_abusives, le champ \"montant_recuperable\" (nombre) vaut 0 PAR DEFAUT. Tu ne le renseignes (>0) que si tu peux le calculer a partir d'un montant explicitement present dans les documents : "
    + "honoraires d'agence factures au locataire au-dela du plafond ALUR (l'excedent), frais de visite/dossier factures en plus (leur montant), ou une somme chiffree indûment versee. "
    + "Si aucun montant n'est explicitement ecrit dans les documents, mets 0. N'INCLUS PAS ici le trop-percu de loyer ni le depot de garantie (calcules par le systeme), pour eviter tout double-comptage.\n"
    + "Le champ \"resume\" ne doit contenir AUCUN chiffre en euros ou en euros/m2 (ni loyer, ni plafond, ni trop-percu, ni total, ni pourcentage chiffre) : ces valeurs sont calculees et affichees separement par le systeme. Decris les problemes qualitativement, sans aucun montant.\n"
    + "Analyse TOUTES les irregularites trouvees dans le bail ET dans chaque document complementaire. JSON pur uniquement.";
}
 
function buildEtatDesLieuxPrompt(context) {
  var depot = (context && context.depot) || 0;
  return "Analyse cet etat des lieux d'un logement locatif francais.\n"
    + (depot > 0 ? "Depot de garantie verse : " + depot + " euros. Identifie les retenues potentiellement abusives.\n" : '')
    + "\nReponds UNIQUEMENT avec un JSON valide, sans texte avant ni apres, sans backticks.\n"
    + "Format : {\"score\":75,\"verdict\":\"Equitable\",\"verdict_titre\":\"Etat conforme\",\"resume\":\"Resume.\",\"loyer\":null,\"clauses_abusives\":[{\"type\":\"warning\",\"titre\":\"Element\",\"description\":\"Desc.\",\"explication_juridique\":\"Explication.\",\"base_legale\":[\"Decret 26 aout 1987\"],\"action\":\"Action.\",\"montant_recuperable\":0}],\"plan_action\":[\"Etape 1\",\"Etape 2\"]}\n\n"
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
    if (ext.date_debut_bail && !context.date_debut_bail) context.date_debut_bail = ext.date_debut_bail;
    if (ext.loyer_reference_majore && !context.loyer_reference_majore) context.loyer_reference_majore = ext.loyer_reference_majore;
    if (ext.loyer_precedent_locataire && !context.loyer_precedent_locataire) context.loyer_precedent_locataire = ext.loyer_precedent_locataire;
    if (ext.annee_loyer_precedent && !context.annee_loyer_precedent) context.annee_loyer_precedent = ext.annee_loyer_precedent;
    if (ext.premiere_location === true && context.premiere_location === undefined) context.premiere_location = true;
    console.log('[skip_form] Context hydrate depuis extraction:', JSON.stringify({
      ville: context.ville, surface: context.surface, loyer_base: context.loyer_base,
      depot: context.depot, type_bien: context.type_bien
    }));

    // Re-resoudre le plafond avec les valeurs extraites — SEULEMENT si le moteur
    // quartier (IRIS) ne l'a pas deja resolu (sinon on ecraserait le precis par la moyenne).
    if (!context._plafondInfo) {
      try {
        var newPlafond = getLoyerPlafond({
          zone: (context && context.encadrement_zone) || '',
          ville: context.ville,
          nbPieces: context.nb_pieces || estimateNbPieces(context.surface),
          epoque: context.annee_construction ? devineEpoque(context.annee_construction) : null,
          typeBien: context.type_bien || 'vide',
          quartier: (context && context.code_postal) || context.ville
        });
        if (newPlafond) {
          context._plafondInfo = newPlafond;
          console.log('[skip_form] Plafond re-resolu apres extraction:', newPlafond.plafond_m2, '€/m²');
        }
      } catch (e) {
        console.warn('[skip_form] Erreur re-resolution plafond:', e && e.message);
      }
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
  // ── PLAFOND DECLARE AU BAIL (autoritaire) ──
  // Si le bail mentionne lui-meme le loyer de reference majore (€/m²), c'est la
  // valeur legalement opposable pour CE contrat. On la prend en priorite quand le
  // moteur n'a pas de resolution precise (adresse non geolocalisee -> estimation).
  var _majBail = parseFloat(context && context.loyer_reference_majore) || 0;
  var _plafExist = context && context._plafondInfo;
  if (_majBail > 3 && _majBail < 60 && (!_plafExist || _plafExist.estimation)) {
    var _refBail = Math.round((_majBail / 1.2) * 100) / 100;
    context._plafondInfo = {
      plafond_m2: _majBail,
      ref_m2: _refBail,
      minore_m2: Math.round((_refBail * 0.7) * 100) / 100,
      encadrement_actif: true,
      estimation: false,
      estimation_note: null,
      source: 'bail'
    };
    console.log('[plafond] Loyer de reference majore lu sur le bail:', _majBail, '€/m² -> plafond autoritaire');
  }

  var plafondInfo = (context && context._plafondInfo) || getLoyerPlafond({
    zone: (context && context.encadrement_zone) || '',
    ville: (context && context.ville) || '',
    nbPieces: (context && context.nb_pieces) || estimateNbPieces(context && context.surface),
    epoque: (context && context.annee_construction) ? devineEpoque(context.annee_construction) : null,
    typeBien: (context && context.type_bien) || 'vide',
    quartier: (context && context.code_postal) || (context && context.quartier) || (context && context.ville)
  });

  if (plafondInfo && plafondInfo.hors_encadrement) {
    if (!parsed.loyer || typeof parsed.loyer !== 'object') parsed.loyer = {};
    parsed.loyer.plafond = null; parsed.loyer.plafond_m2 = null; parsed.loyer.plafond_m2_num = null;
    parsed.loyer.ref_m2_num = null; parsed.loyer.minore_m2_num = null;
    parsed.loyer.trop_percu = null; parsed.loyer.exedent_mensuel = null;
    parsed.loyer.encadrement_strict = false; parsed.loyer.estimation = false; parsed.loyer.estimation_note = null;
    parsed.loyer.statut = 'ok';
    parsed.loyer.analyse = "D'apres l'adresse, ce logement se situe hors du perimetre d'encadrement des loyers" + (plafondInfo.quartier ? " (secteur " + plafondInfo.quartier + ")" : "") + ". Aucun plafond de loyer encadre ne s'y applique. En cas de doute, verifiez sur le simulateur officiel de votre agglomeration.";
  } else if (plafondInfo && loyerM2 !== null && surface > 0) {
    if (!parsed.loyer || typeof parsed.loyer !== 'object') parsed.loyer = {};
    // Plafond/m2 le plus DEFENDABLE : si le bail declare lui-meme un loyer de reference
    // majore coherent (a moins de 40% de la grille), on retient le PLUS BAS des deux.
    // Le bailleur est tenu par sa propre mention, et le loyer ne peut de toute facon
    // pas depasser le maximum de la grille. Sinon, on garde la grille.
    var _lrmBail = parseFloat(context && context.loyer_reference_majore) || 0;
    var plafondM2Eff = plafondInfo.plafond_m2;
    if (plafondInfo.encadrement_actif && _lrmBail >= 8 && _lrmBail <= 50
        && Math.abs(_lrmBail - plafondInfo.plafond_m2) <= 0.4 * plafondInfo.plafond_m2) {
      plafondM2Eff = Math.min(plafondInfo.plafond_m2, _lrmBail);
    }
    // Forcer le plafond (format texte attendu par le frontend)
    var plafondMensuelGrille = Math.round(plafondM2Eff * surface * 100) / 100;
    parsed.loyer.plafond = plafondMensuelGrille.toFixed(2).replace('.', ',') + ' €';
    parsed.loyer.plafond_m2 = plafondM2Eff.toFixed(2).replace('.', ',') + ' €/m²';
    // Exposer aussi les loyers de reference et minore pour la comparaison marche (frontend)
    parsed.loyer.ref_m2 = plafondInfo.ref_m2.toFixed(2).replace('.', ',') + ' €/m²';
    parsed.loyer.ref_m2_num = plafondInfo.ref_m2;
    parsed.loyer.minore_m2_num = plafondInfo.minore_m2;
    parsed.loyer.plafond_m2_num = plafondM2Eff;
    parsed.loyer.encadrement_strict = plafondInfo.encadrement_actif;
    var estim = !!plafondInfo.estimation;
    parsed.loyer.estimation = estim;
    parsed.loyer.estimation_note = plafondInfo.estimation_note || null;
    // Calcul statut deterministe
    var depasse = loyerM2 > plafondM2Eff + 0.01;
    if (plafondInfo.encadrement_actif) {
      // Plafond exact -> verdict ferme. Plafond MOYENNE (info manquante) -> on n'affirme pas, on alerte.
      parsed.loyer.statut = depasse ? (estim ? 'warning' : 'danger') : 'ok';
    } else {
      // Hors encadrement des loyers : aucun plafond legal opposable -> JAMAIS danger/warning.
      parsed.loyer.statut = 'ok';
    }
    // Reformuler l'analyse en termes generaux (sans reveler la source de la grille)
    var loyM2Txt = loyerM2.toFixed(2).replace('.', ',');
    var plafM2Txt = plafondM2Eff.toFixed(2).replace('.', ',');
    var estimSuffix = estim ? " Attention : ce plafond est une estimation (" + (plafondInfo.estimation_note || 'information manquante') + "). Renseignez l'annee de construction et le nombre de pieces pour un calcul exact." : "";
    if (!plafondInfo.encadrement_actif) {
      // HORS ENCADREMENT : message clair + repere purement indicatif, non alarmiste, sans trop-percu.
      parsed.loyer.exedent_mensuel = null;
      parsed.loyer.trop_percu = null;
      parsed.loyer.hors_encadrement = true;
      var _ztLoyer = isZoneTendue(context);
      if (_ztLoyer === true) {
        parsed.loyer.analyse = "Votre commune n'applique pas l'encadrement du NIVEAU des loyers (aucun loyer plafond opposable a la signature), mais elle est en ZONE TENDUE. Concretement : a la relocation, le loyer ne peut pas depasser celui paye par le locataire precedent (revise selon l'IRL), et votre preavis de depart est reduit a 1 mois. A titre indicatif, votre loyer de " + loyM2Txt + " euros/m2 hors charges se situe " + (depasse ? "au-dessus du" : "dans le") + " repere de marche local (environ " + plafM2Txt + " euros/m2).";
      } else {
        parsed.loyer.analyse = "Votre commune n'applique pas l'encadrement du NIVEAU des loyers : aucun loyer plafond legal n'est opposable a la signature du bail. A titre indicatif, votre loyer de " + loyM2Txt + " euros/m2 hors charges se situe " + (depasse ? "au-dessus du" : "dans le") + " repere de marche local (environ " + plafM2Txt + " euros/m2). Attention : votre commune peut relever de la ZONE TENDUE, un autre dispositif ou le loyer a la relocation ne peut pas depasser celui du locataire precedent (revise selon l'IRL) et le preavis est reduit a 1 mois. Verifiez sur le simulateur officiel encadrementdesloyers.gouv.fr ou service-public.fr avec votre adresse.";
      }
    } else if (depasse) {
      parsed.loyer.exedent_mensuel = Math.round((loyerM2 - plafondM2Eff) * surface * 100) / 100;
      if (estim) {
        parsed.loyer.analyse = "Votre loyer s'eleve a " + loyM2Txt + " euros/m2 hors charges, au-dessus d'une estimation du plafond (" + plafM2Txt + " euros/m2)." + estimSuffix;
      } else {
        parsed.loyer.analyse = "Votre loyer s'eleve a " + loyM2Txt + " euros/m2 hors charges, ce qui depasse le plafond legal (" + plafM2Txt + " euros/m2).";
      }
    } else {
      parsed.loyer.exedent_mensuel = null;
      parsed.loyer.trop_percu = null;
      parsed.loyer.analyse = "Votre loyer s'eleve a " + loyM2Txt + " euros/m2 hors charges, ce qui respecte le plafond legal (" + plafM2Txt + " euros/m2)." + estimSuffix;
    }
  } else if (!plafondInfo && parsed.loyer && typeof parsed.loyer === 'object') {
    // Aucun plafond fiable resolu : on ne laisse PAS passer un plafond/trop-percu invente par l'IA.
    parsed.loyer.plafond = null;
    parsed.loyer.plafond_m2 = null;
    parsed.loyer.plafond_m2_num = null;
    parsed.loyer.ref_m2_num = null;
    parsed.loyer.trop_percu = null;
    parsed.loyer.exedent_mensuel = null;
    if (parsed.loyer.statut === 'danger' || parsed.loyer.statut === 'warning') parsed.loyer.statut = 'ok';
    parsed.loyer.analyse = "Le plafond d'encadrement n'a pas pu etre determine automatiquement pour ce logement. Verifiez votre loyer de reference sur le simulateur officiel de votre prefecture.";
  }

  // ────────────────────────────────────────────────────────────
  // COHERENCE MILLESIME : le plafond opposable est l'arrete en vigueur A LA DATE
  // DE SIGNATURE du bail. Nos grilles sont par millesime ; si la date du bail tombe
  // hors de la periode couverte, on n'affirme pas un verdict ferme -> estimation + note.
  // ────────────────────────────────────────────────────────────
  try {
    if (parsed.loyer && typeof parsed.loyer === 'object' && parsed.loyer.encadrement_strict && parsed.loyer.plafond_m2_num != null) {
      var _vkM = normaliseVille(context && context.ville);
      var _dDeb = (context && context.date_debut_bail) || (parsed.context_extrait && parsed.context_extrait.date_debut_bail) || null;
      if (!(typeof _dDeb === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(_dDeb))) _dDeb = null;
      var VALIDITES = {
        'grenoble':       { debut: '2026-01-20', fin: '2026-11-24', label: "la periode du 20/01/2026 au 24/11/2026" },
        'pays-basque':    { debut: '2025-11-25', fin: '2099-12-31', label: "la periode en vigueur depuis le 25/11/2025" },
        'plaine-commune': { debut: '2023-06-01', fin: '2024-05-31', label: "le millesime 2023 (01/06/2023 au 31/05/2024)" },
        'est-ensemble':   { debut: '2023-06-01', fin: '2024-05-31', label: "le millesime 2023 (01/06/2023 au 31/05/2024)" }
      };
      var _noteMil = null;
      if (_dDeb) {
        var _val = VALIDITES[_vkM];
        if (_val) {
          if (_dDeb < _val.debut || _dDeb > _val.fin)
            _noteMil = "Le plafond opposable est celui de l'arrete en vigueur a la date de signature du bail (" + _dDeb + "). Notre reference couvre " + _val.label + ". Verifiez le loyer de reference pour cette date sur le simulateur officiel.";
        } else if (plafondInfo && plafondInfo.annee) {
          var _by = parseInt(_dDeb.slice(0, 4), 10);
          if (_by && Math.abs(_by - plafondInfo.annee) >= 2)
            _noteMil = "Notre reference est le millesime " + plafondInfo.annee + " ; le plafond opposable depend de l'arrete en vigueur a la signature du bail (" + _dDeb + "). Verifiez le simulateur officiel pour cette date.";
        }
      }
      if (_noteMil) {
        // L'ecart inter-annuel des grilles est faible (~1-4%/an). On n'adoucit le
        // verdict que si le loyer est PROCHE du plafond (a 8% pres), cas ou l'annee
        // peut faire basculer ok <-> depassement. Sinon le constat reste ferme.
        var _loyM2c = (typeof loyerM2 === 'number' && loyerM2 > 0) ? loyerM2 : computeLoyerM2(context);
        var _plafc = parsed.loyer.plafond_m2_num;
        var _ecartRel = (typeof _loyM2c === 'number' && _loyM2c > 0 && _plafc > 0) ? Math.abs(_loyM2c - _plafc) / _plafc : 1;
        if (_ecartRel <= 0.08) {
          // cas limite -> prudence : estimation + verdict adouci + mention complete
          parsed.loyer.estimation = true;
          parsed.loyer.estimation_note = parsed.loyer.estimation_note ? (parsed.loyer.estimation_note + ' + ' + _noteMil) : _noteMil;
          if (parsed.loyer.statut === 'danger') parsed.loyer.statut = 'warning';
          if (parsed.loyer.analyse) parsed.loyer.analyse = parsed.loyer.analyse + ' ' + _noteMil;
          console.log('[millesime] bail', _dDeb, 'hors periode', _vkM, '+ loyer proche du plafond (' + Math.round(_ecartRel * 100) + '%) → verdict adouci');
        } else {
          // cas tranche -> verdict ferme conserve, simple mention informative
          var _noteLeg = "A noter : ce bail a ete signe sous un arrete anterieur. Les loyers de reference varient peu d'une annee a l'autre, ce qui ne change pas ce constat. En cas de doute, verifiez le simulateur officiel a la date de signature.";
          parsed.loyer.estimation_note = parsed.loyer.estimation_note ? (parsed.loyer.estimation_note + ' + ' + _noteLeg) : _noteLeg;
          if (parsed.loyer.analyse) parsed.loyer.analyse = parsed.loyer.analyse + ' ' + _noteLeg;
          console.log('[millesime] bail', _dDeb, 'hors periode', _vkM, '+ loyer loin du plafond (' + Math.round(_ecartRel * 100) + '%) → verdict ferme + mention');
        }
      }
    }
  } catch (e) { console.warn('[millesime] verif echouee:', e && e.message); }

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
      // Filet anti-invention : aucun montant chiffre dans le resume (les vrais chiffres sont affiches a part)
      .replace(/(?:de |d['’]environ |environ |jusqu['’]a |pres de |soit |\()?\d[\d  .]*[,.]?\d*\s*€\s*\/\s*m[²2]/gi, '')
      .replace(/(?:de |d['’]environ |environ |jusqu['’]a |pres de |soit |\()?\d[\d  .]*[,.]?\d*\s*(?:€|euros?)\b/gi, '')
      .replace(/\d+\s*%/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/,\s*,/g, ',').replace(/\(\s*,/g, '(').trim();
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

  // ────────────────────────────────────────────────────────────
  // MONEY ENGINE : aucun euro invente par le modele. Tous les montants
  // (loyer / depot / complement / total) sont (re)calcules ici.
  // ────────────────────────────────────────────────────────────
  try {
    var M = computeMoneyEngine(parsed, context);
    if (!Array.isArray(parsed.clauses_abusives)) parsed.clauses_abusives = [];

    // 1. Annuler tout montant que le modele aurait mis sur loyer/depot/complement
    //    (anti-invention + anti-double-comptage : ces buckets sont geres ci-dessous).
    parsed.clauses_abusives.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var t = ((c.titre || '') + ' ' + (c.description || '')).toLowerCase();
      if (/d[eé]p[oô]t|garantie|compl[eé]ment|plafond|encadrement/.test(t)) c.montant_recuperable = 0;
    });

    // 2. Retirer une fausse alerte "depot excessif" si le depot est en realite conforme
    parsed.clauses_abusives = parsed.clauses_abusives.filter(function (c) {
      if (!c) return false;
      var t = ((c.titre || '') + ' ' + (c.description || '')).toLowerCase();
      var estDepot = /d[eé]p[oô]t|garantie/.test(t);
      if (estDepot && M.depotExcedent === 0 && c.type === 'danger') return false;
      return true;
    });

    // 3. (Re)injecter les clauses chiffrees deterministes
    function _upsertClause(cl) {
      var found = false;
      parsed.clauses_abusives.forEach(function (c) {
        if (c && c.titre === cl.titre) { c.montant_recuperable = cl.montant_recuperable; found = true; }
      });
      if (!found) parsed.clauses_abusives.push(cl);
    }
    if (M.depotExcedent > 0) {
      _upsertClause({
        type: 'danger', titre: 'Depot de garantie excessif',
        description: 'Le depot verse (' + M.depot + ' euros) depasse le maximum legal de ' + M.depotMax + ' euros (' + M.depotMoisMax + ' mois de loyer hors charges).',
        explication_juridique: "L'article 22 de la loi du 6 juillet 1989 limite le depot a " + M.depotMoisMax + " mois de loyer hors charges pour un logement " + (M.depotMoisMax === 2 ? 'meuble' : 'vide') + ".",
        base_legale: ['Art. 22 loi n.89-462 du 6 juillet 1989'],
        action: "Demander la restitution immediate de l'excedent.",
        montant_recuperable: M.depotExcedent
      });
    }
    if (M.complementInjustifie && M.complementRecuperable > 0) {
      _upsertClause({
        type: 'danger', titre: 'Complement de loyer non justifie',
        description: "Un complement de loyer de " + M.complement + " euros/mois est applique sans caracteristiques exceptionnelles de localisation ou de confort justifiees au bail.",
        explication_juridique: "L'article 17-2 de la loi du 6 juillet 1989 n'autorise un complement de loyer que pour des caracteristiques exceptionnelles dument justifiees. A defaut, il est contestable.",
        base_legale: ['Art. 17-2 loi n.89-462 du 6 juillet 1989'],
        action: "Contester le complement aupres du bailleur, puis saisir la Commission departementale de conciliation si necessaire.",
        montant_recuperable: M.complementRecuperable
      });
    }

    // 3bis. ZONE TENDUE : mention obligatoire du loyer precedent + plafond a la relocation
    var RZT = computeRelocationZoneTendue(parsed, context);
    parsed.zone_tendue = RZT; // null si non applicable
    if (RZT && RZT.applicable && !RZT.premiere_location) {
      if (RZT.mention_presente === false) {
        _upsertClause({
          type: 'warning', titre: 'Mention obligatoire manquante (zone tendue)',
          description: "En zone tendue, le bail doit indiquer le montant du dernier loyer du precedent locataire, la date de son versement et celle de sa derniere revision. Cette mention est absente.",
          explication_juridique: "Article 17 de la loi du 6 juillet 1989 : en zone tendue, lors d'une relocation, ces informations sont obligatoires. Leur absence prive le bailleur de justification et facilite la contestation du loyer.",
          base_legale: ['Art. 17 loi n.89-462 du 6 juillet 1989'],
          action: "Demander au bailleur le dernier loyer du precedent locataire ; a defaut, saisir la Commission departementale de conciliation.",
          montant_recuperable: 0
        });
      }
      if (RZT.recuperable > 0) {
        _upsertClause({
          type: 'danger', titre: 'Loyer au-dessus du plafond a la relocation (zone tendue)',
          description: "Le loyer de base (" + (parseFloat(context.loyer_base) || 0) + " euros) depasse le dernier loyer du precedent locataire revalorise par l'IRL (plafond " + RZT.plafond_relocation + " euros)" + (RZT.estimation ? " (estimation IRL)" : "") + ".",
          explication_juridique: "En zone tendue, le loyer d'une relocation ne peut exceder l'ancien loyer revalorise selon l'IRL (art. 17 loi du 6 juillet 1989), sauf travaux importants, loyer manifestement sous-evalue ou vacance superieure a 18 mois.",
          base_legale: ['Art. 17 loi n.89-462 du 6 juillet 1989'],
          action: "Demander la mise en conformite du loyer et la restitution du trop-percu ; saisir la Commission departementale de conciliation en cas de refus.",
          montant_recuperable: RZT.recuperable
        });
      }
    }

    // 4. Trop-percu de loyer (depassement plafond) -> porte par loyer.trop_percu
    if (parsed.loyer && typeof parsed.loyer === 'object') {
      parsed.loyer.trop_percu = M.tropPercuLoyer > 0 ? M.tropPercuLoyer : null;
    }

    // 5. Recap chiffre central : SOURCE UNIQUE DE VERITE (front + lettres).
    //    total = trop-percu loyer + complement + depot + autres clauses chiffrees (honoraires...)
    var _autresClauses = parsed.clauses_abusives.reduce(function (s, c) {
      var t = ((c && c.titre) || '').toLowerCase();
      if (/d[eé]p[oô]t|garantie|compl[eé]ment/.test(t)) return s; // deja comptes
      var m = (c && typeof c.montant_recuperable === 'number' && c.montant_recuperable > 0) ? c.montant_recuperable : 0;
      return s + m;
    }, 0);
    var _total = Math.round((M.tropPercuLoyer + M.complementRecuperable + M.depotExcedent + _autresClauses) * 100) / 100;

    parsed.recap = {
      nb_mois: M.nbMois,
      exedent_mensuel: M.overpaymentMensuel || 0,
      trop_percu_loyer: M.tropPercuLoyer || 0,
      complement_mensuel: M.complementInjustifie ? M.complement : 0,
      complement_recuperable: M.complementRecuperable || 0,
      depot_excedent: M.depotExcedent || 0,
      relocation_recuperable: (RZT && RZT.recuperable) || 0,
      zone_tendue: !!(RZT && RZT.applicable),
      autres_recuperable: Math.round(_autresClauses * 100) / 100,
      total_recuperable: _total
    };

    // 6. Alimenter le generateur de lettres avec les VRAIS montants
    if (_total > 0) {
      context.trop_percu_total = _total.toFixed(2).replace('.', ',') + ' euros';
      context.nb_mois_bail = M.nbMois;
      if (M.overpaymentMensuel > 0) context.trop_percu_mensuel = M.overpaymentMensuel.toFixed(2).replace('.', ',') + ' euros/mois';
    }

    console.log('[money] recap', JSON.stringify(parsed.recap));
  } catch (e) { console.warn('[money] engine echoue:', e && e.message); }

  // ────────────────────────────────────────────────────────────
  // COHERENCE SCORE + VERDICT : vocabulaire FIXE, et le score ne doit pas etre
  // catastrophique quand RIEN n'a ete detecte (ex. analyse sans bail uploade).
  // ────────────────────────────────────────────────────────────
  try {
    var _clauses = Array.isArray(parsed.clauses_abusives) ? parsed.clauses_abusives : [];
    var _nbDanger = _clauses.filter(function (c) { return c && c.type === 'danger'; }).length;
    var _loyerStatut = (parsed.loyer && typeof parsed.loyer === 'object') ? parsed.loyer.statut : null;
    var _loyerDanger = _loyerStatut === 'danger';
    var _loyerWarn = _loyerStatut === 'warning';
    // Plancher : aucun probleme detecte (0 clause, loyer ok) -> pas de score catastrophique
    if (_clauses.length === 0 && !_loyerDanger && !_loyerWarn && typeof parsed.score === 'number' && parsed.score < 75) {
      console.log('[score] aucun probleme detecte mais score', parsed.score, '→ remonte a 75');
      parsed.score = 75;
    }
    // Verdict a vocabulaire FIXE (Conforme / Vigilance / Risque / Danger), derive du score + gravite reelle
    var _s = (typeof parsed.score === 'number') ? parsed.score : 50;
    parsed.verdict = (_loyerDanger || _nbDanger >= 3 || _s < 40) ? 'Danger'
                   : (_nbDanger >= 1 || _loyerWarn || _s < 60) ? 'Risque'
                   : (_s < 80) ? 'Vigilance'
                   : 'Conforme';
  } catch (e) { console.warn('[score/verdict] normalisation echouee:', e && e.message); }

  // ────────────────────────────────────────────────────────────
  // GARDE-FOU FAIBLE CONFIANCE : si l'extraction est interne-ment incoherente
  // (typiquement bail manuscrit/scanne mal lu), on N'AFFICHE PAS un montant faux
  // avec aplomb. On marque l'analyse "a confirmer" et on adoucit le verdict.
  // ────────────────────────────────────────────────────────────
  try {
    if (context && context._extraction_low_confidence) {
      parsed._low_confidence = true;
      parsed._low_confidence_reasons = context._extraction_flags || [];
      if (parsed.loyer && typeof parsed.loyer === 'object') {
        parsed.loyer.estimation = true;
        var _noteLC = "Valeurs lues automatiquement sur un document scanne/manuscrit : elles semblent incoherentes (la lecture des chiffres est incertaine). Verifiez et corrigez la surface, le loyer de base et le complement avant d'agir.";
        parsed.loyer.estimation_note = parsed.loyer.estimation_note ? (parsed.loyer.estimation_note + ' ' + _noteLC) : _noteLC;
        if (parsed.loyer.statut === 'danger') parsed.loyer.statut = 'warning';
      }
      // Pas de verdict "Danger" peremptoire sur des valeurs incertaines
      if (parsed.verdict === 'Danger') parsed.verdict = 'Risque';
      if (parsed.recap && typeof parsed.recap === 'object') parsed.recap.low_confidence = true;
      console.warn('[low-confidence] analyse marquee a confirmer:', (context._extraction_flags || []).join(' | '));
    }
  } catch (e) { console.warn('[low-confidence] echec:', e && e.message); }

  // ────────────────────────────────────────────────────────────
  // RECONCILIATION VERDICT <-> MOTEUR DETERMINISTE
  // Le calcul fait foi. On interdit au titre / verdict / resume d'affirmer un probleme
  // financier (depot excessif, trop-percu, loyer illegal) que les montants dementent.
  // Ne s'applique pas en faible confiance (on garde le "a confirmer").
  // ────────────────────────────────────────────────────────────
  try {
    if (!parsed._low_confidence) {
      // Ville HORS encadrement : aucun excedent LEGAL possible. Le repere de marche
      // (loyer > mediane locale) reste affiche ailleurs comme info, mais ce n'est ni un
      // depassement de plafond ni une somme recuperable. On purge le champ excedent.
      if (parsed.loyer && parsed.loyer.hors_encadrement === true) {
        parsed.loyer.exedent_mensuel = null;
        parsed.loyer.trop_percu = null;
        if (parsed.recap && typeof parsed.recap === 'object') parsed.recap.exedent_mensuel = 0;
      }

      var _rc = parsed.recap || {};
      var _depotExc = parseFloat(_rc.depot_excedent) || 0;
      var _tropLoyer = (parseFloat(_rc.trop_percu_loyer) || 0) + (parseFloat(_rc.complement_recuperable) || 0);
      var _totalRec = parseFloat(_rc.total_recuperable) || 0;
      var _nbClauses = (parsed.clauses_abusives || []).length;
      var _loyerDepasse = parsed.loyer && parsed.loyer.statut === 'depasse';

      var _depotAlarm = function (s) { return /d[ée]p[oô]t/i.test(s) && /(excessif|ill[ée]gal|abusif|d[ée]passe|sup[ée]rieur|trop[\s-]?[ée]lev|probl[èe]me|non[\s-]?conforme)/i.test(s); };
      var _loyerAlarm = function (s) { return /(loyer|trop[\s-]?per[çc]u|encadrement)/i.test(s) && /(d[ée]passe|ill[ée]gal|excessif|sup[ée]rieur|trop[\s-]?per[çc]u|non[\s-]?respect|abusif|surpay)/i.test(s); };

      var _pickTitle = function () {
        if (_totalRec > 0) return 'Sommes potentiellement récupérables';
        if (_loyerDepasse) return 'Loyer au-dessus du plafond';
        if (_nbClauses > 0) return (_nbClauses === 1 ? '1 clause à vérifier' : _nbClauses + ' clauses à vérifier');
        return 'Bail conforme selon les éléments fournis';
      };

      var _killDepot = (_depotExc <= 0);
      var _killLoyer = (_tropLoyer <= 0 && !_loyerDepasse);

      // 1) Titre incoherent -> on le recadre
      var _titre = parsed.verdict_titre || '';
      if ((_killDepot && _depotAlarm(_titre)) || (_killLoyer && _loyerAlarm(_titre))) {
        parsed.verdict_titre = _pickTitle();
      }

      // 2) Resume : on retire les phrases d'alarme contredites par le calcul
      if (parsed.resume && (_killDepot || _killLoyer)) {
        var _phrases = parsed.resume.match(/[^.!?]+[.!?]*/g) || [parsed.resume];
        var _kept = _phrases.filter(function (s) {
          if (_killDepot && _depotAlarm(s)) return false;
          if (_killLoyer && _loyerAlarm(s)) return false;
          return true;
        });
        var _newResume = _kept.join(' ').replace(/\s+/g, ' ').trim();
        if (_newResume.length < 40) {
          _newResume = (_totalRec === 0 && _nbClauses === 0 && !_loyerDepasse && _depotExc === 0)
            ? "Selon les éléments fournis, aucune irrégularité chiffrable n'est détectée (loyer, dépôt et complément conformes). Pour un contrôle complet des clauses, ajoutez le bail."
            : _newResume + " Détail des montants et clauses ci-dessous.";
        }
        parsed.resume = _newResume;
      }

      // 3) Aucun probleme reel -> le verdict ne peut pas rester alarmant
      var _aucunProbleme = (_totalRec === 0 && _nbClauses === 0 && !_loyerDepasse && _depotExc <= 0);
      if (_aucunProbleme) {
        parsed.verdict = 'Conforme';
        if (typeof parsed.score === 'number' && parsed.score < 80) parsed.score = 80;
        if (_depotAlarm(parsed.verdict_titre || '') || _loyerAlarm(parsed.verdict_titre || '')) {
          parsed.verdict_titre = 'Bail conforme selon les éléments fournis';
        }
      }
    }
  } catch (e) { console.warn('[reconciliation] echec:', e && e.message); }

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
    var meuble = (bienType === 'meuble');
    // ATTENTION : encadrement strict ⊂ zone tendue, mais la zone tendue est bien plus large
    // (~1400+ communes : Toulon, Nice, Marseille, etc.). En zone tendue le preavis locataire
    // est reduit a 1 mois MEME sans encadrement. Le code ne connait pas la liste zone tendue,
    // donc hors meuble/encadrement on N'AFFIRME PAS 3 mois : on explicite la regle.
    var preavisInfo;
    var ztPreavis = isZoneTendue(context);
    if (meuble) preavisInfo = "1 mois (logement meuble : preavis toujours d'1 mois)";
    else if (encadre) preavisInfo = "1 mois (commune en zone d'encadrement, donc zone tendue)";
    else if (ztPreavis === true) preavisInfo = "1 mois (commune en zone tendue : preavis locataire reduit a 1 mois, art. 15 loi 1989)";
    else preavisInfo = "1 mois SI le logement est en zone tendue (a verifier sur service-public.fr), sinon 3 mois";
    specifInstructions = "\n=== SPECIFIQUE PREAVIS DE DEPART ===\n"
      + "- Duree de preavis applicable : " + preavisInfo + "\n"
      + ((!meuble && !encadre && ztPreavis !== true) ? "- IMPORTANT : rappeler au locataire que la zone tendue reduit le preavis a 1 mois meme sans encadrement, et l'inviter a verifier sa commune sur service-public.fr avant d'indiquer la date de depart.\n" : "")
      + "- Inviter le bailleur a convenir d'un EDL de sortie\n"
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
  function _call(modelId) {
    return fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25"
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages
      })
    });
  }
  var response = await _call(MODEL);
  // Repli automatique sur Sonnet si Opus est momentanement indisponible (rate limit / incident)
  if (!response.ok && MODEL !== FALLBACK_MODEL) {
    var _e1 = '';
    try { _e1 = await response.text(); } catch (e) {}
    console.warn('[analyse] modele', MODEL, 'indisponible (' + response.status + ') — repli sur', FALLBACK_MODEL, _e1.slice(0, 120));
    response = await _call(FALLBACK_MODEL);
  }
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
 * EXTRACTION PRELIMINAIRE depuis un PDF de bail.
 * Appel separe a Claude avec un prompt minimaliste : juste extraire les 11 infos
 * et renvoyer en JSON pur. Pas d'analyse, pas de clauses.
 * Beaucoup plus fiable que de tout demander en un seul appel.
 */
async function extractContextFromDoc(input) {
  var pdfBase64 = (input && input.pdf) || null;
  var bailText = (input && input.text) || null;
  if (!pdfBase64 && !bailText) return null;
  try {
    var promptExtract = "Tu lis un BAIL de location francais (souvent un PDF scanne, parfois manuscrit). Procede en DEUX temps.\n\n"
      + "ETAPE 1 — LECTURE VERBATIM. Recopie d'abord, ligne par ligne, ce que tu LIS REELLEMENT sur le document, chiffre par chiffre (meme manuscrit). Si un repere est illisible ou absent, ecris ?. Ne complete pas, ne devine pas :\n"
      + "Ville du logement : ...\n"
      + "Adresse du logement (numero et voie) : ...\n"
      + "Code postal du logement : ...\n"
      + "Surface habitable (en m2) : ...\n"
      + "Loyer mensuel total : ...\n"
      + "Loyer de base (egal au loyer de reference majore) : ...\n"
      + "Montant du complement de loyer : ...\n"
      + "Loyer de reference majore (en euros/m2) : ...\n"
      + "Provisions sur charges : ...\n"
      + "Depot de garantie : ...\n"
      + "Date de prise d'effet : ...\n"
      + "Dernier loyer du precedent locataire (si mentionne) : ...\n"
      + "Annee / date du dernier loyer du precedent locataire : ...\n\n"
      + "ETAPE 2 — JSON. Ensuite seulement, remplis le schema ci-dessous A PARTIR de ta lecture de l'etape 1. Aucune valeur inventee, aucune valeur recopiee du schema (ce sont des placeholders vides). Le JSON doit etre la DERNIERE chose de ta reponse, en JSON pur (sans markdown ni backticks).\n"
      + "SCHEMA A REMPLIR (placeholders, NE PAS RECOPIER) :\n"
      + '{"ville":"","adresse":"","code_postal":"","surface":0,"nb_pieces":0,"annee_construction":0,"loyer_base":0,"charges":0,"depot":0,"type_bien":"vide","type_location":"principale","complement_loyer":0,"complement_justif":"","honoraires_agence":0,"frais_visite":0,"date_debut_bail":"","nb_mois_bail":0,"loyer_reference_majore":0,"loyer_total_mensuel":0,"loyer_precedent_locataire":0,"annee_loyer_precedent":0,"premiere_location":false}\n'
      + "Regles :\n"
      + "- ville : commune du logement loue (string)\n"
      + "- adresse : numero + voie du logement loue, sans la ville ni le code postal. '' si absent\n"
      + "- code_postal : code postal du logement, 5 chiffres en string. DETERMINANT pour Paris/Lyon. '' si absent\n"
      + "- surface : surface habitable en m2, lue EXACTEMENT sur la ligne 'Surface habitable (en m2)'. Reporte le nombre tel qu'ecrit sur le bail, meme manuscrit (number)\n"
      + "- nb_pieces : nombre de pieces principales (number). Studio/T1 = 1, T2 = 2, etc. 0 si absent\n"
      + "- annee_construction : annee de construction si mentionnee (bail ou DPE annexe), 4 chiffres. 0 si absente\n"
      + "- loyer_base : loyer de BASE hors charges (number).\n"
      + "  >>> CAS COMPLEMENT DE LOYER (zone encadree) : si le bail distingue un 'Montant du loyer de base (egal au loyer de reference majore)' ET un 'Montant du complement de loyer', alors loyer_base = le MONTANT DU LOYER DE BASE (ex le plus petit des deux), JAMAIS le loyer mensuel total. Le complement va dans complement_loyer.\n"
      + "  >>> SANS complement : loyer_base = loyer mensuel hors charges, et complement_loyer = 0.\n"
      + "  >>> COHERENCE OBLIGATOIRE : loyer_base + complement_loyer = loyer mensuel total indique au bail. Verifie cette addition avant de repondre.\n"
      + "- complement_loyer : 'Montant du complement de loyer' en euros si present, 0 sinon (number)\n"
      + "- charges : provisions sur charges en euros (number, 0 si absent)\n"
      + "- depot : depot de garantie verse en euros (number, 0 si absent)\n"
      + "- type_bien : 'vide' ou 'meuble' (string)\n"
      + "- type_location : 'principale' / 'meublee_principale' / 'autre' (string)\n"
      + "- loyer_reference_majore : le 'loyer de reference majore' en euros/m2 (mention obligatoire en zone d'encadrement), tel qu'IMPRIME/ECRIT sur le bail. Typiquement entre 10 et 30 euros/m2. NE LE CALCULE JAMAIS a partir du loyer et de la surface : lis le nombre ecrit. Si tu ne le vois pas ecrit, mets 0 (ne le devine pas).\n"
      + "  >>> NE FORCE PAS l'egalite : le loyer de base PEUT depasser loyer_reference_majore x surface, et c'est justement le cas d'un loyer surfacture a signaler. Lis les valeurs telles qu'ecrites sur le bail, ne les modifie jamais pour les faire coller. Ne 'corrige' une valeur QUE si elle rend l'addition base + complement = total manifestement fausse.\n"
      + "- complement_justif : texte de la justification du complement si presente (ligne 'Caracteristiques du logement justifiant le complement'), '' si la case est vide (string)\n"
      + "- honoraires_agence : montant total des honoraires/frais d'agence factures AU LOCATAIRE en euros (number, 0 si absent)\n"
      + "- frais_visite : frais de visite/constitution de dossier factures separement au locataire en euros (number, 0 si absent)\n"
      + "- date_debut_bail : date de prise d'effet au format YYYY-MM-DD ('' si non trouve)\n"
      + "- nb_mois_bail : nb de mois entre date_debut_bail et aujourd'hui (number, 0 si inconnu). Date aujourd'hui : " + new Date().toISOString().slice(0, 10) + "\n"
      + "- loyer_total_mensuel : le loyer mensuel TOTAL hors charges DU LOCATAIRE ACTUEL (number). C'est souvent la valeur la plus fiable car repetee plusieurs fois (ligne 'Montant du loyer mensuel', 'Total du pour un mois' moins les charges). En cas de complement : loyer_total_mensuel = loyer_base + complement_loyer. Reporte le montant corrobore. 0 si introuvable. NE PAS confondre avec le loyer du PRECEDENT locataire (champ separe ci-dessous).\n"
      + "- loyer_precedent_locataire : montant du DERNIER loyer mensuel hors charges paye par le PRECEDENT locataire (PAS le loyer actuel). Cherche activement une ligne du type 'dernier loyer acquitte par le precedent locataire', 'loyer du precedent locataire', 'ancien locataire', 'loyer anterieur'. Reporte le nombre ECRIT a cote, 0 seulement s'il n'y a vraiment aucune mention de ce genre (number).\n"
      + "- annee_loyer_precedent : annee (AAAA) du dernier loyer du precedent locataire ou de sa derniere revision, si indiquee (ex: 'juin 2022' -> 2022). 0 si absente (number)\n"
      + "- premiere_location : true UNIQUEMENT si le bail indique explicitement une PREMIERE mise en location, un logement neuf, ou un logement vacant depuis plus de 18 mois ; false sinon (boolean)\n"
      + "Si une info n'est pas dans le bail : valeur par defaut (0 pour les numbers, '' pour les strings), mais TOUJOURS un JSON valide complet.";

    var _msgContent = (pdfBase64
      ? [ { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }, { type: "text", text: promptExtract } ]
      : [ { type: "text", text: "BAIL A ANALYSER :\n\n" + bailText + "\n\n" + promptExtract } ]);

    async function _callExtract(modelId) {
      return await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "pdfs-2024-09-25"
        },
        body: JSON.stringify({ model: modelId, max_tokens: 1200, messages: [{ role: "user", content: _msgContent }] })
      });
    }

    var response = await _callExtract(EXTRACT_MODEL);
    // Repli automatique sur le modele standard si le modele d'extraction est indisponible
    if (!response.ok && EXTRACT_MODEL !== FALLBACK_MODEL) {
      var _et = '';
      try { _et = await response.text(); } catch (e) {}
      console.warn('[extract-doc] modele', EXTRACT_MODEL, 'indisponible (' + response.status + ') — repli sur', FALLBACK_MODEL, _et.slice(0, 120));
      response = await _callExtract(FALLBACK_MODEL);
    }

    if (!response.ok) {
      var errTxt = await response.text();
      console.warn('[extract-pdf] API echec', response.status, errTxt.slice(0, 200));
      return null;
    }
    var data = await response.json();
    var txt = '';
    for (var i = 0; i < (data.content || []).length; i++) {
      if (data.content[i].type === 'text') txt += data.content[i].text;
    }
    console.log('[extract-pdf] Reponse brute:', txt.slice(0, 300));

    // Parser le JSON
    var clean = txt.replace(/```json/g, '').replace(/```/g, '').trim();
    var fb = clean.indexOf('{');
    var lb = clean.lastIndexOf('}');
    if (fb === -1 || lb === -1) {
      console.warn('[extract-pdf] Pas de JSON dans la reponse');
      return null;
    }
    clean = clean.slice(fb, lb + 1);
    var parsed = JSON.parse(clean);

    // ────────────────────────────────────────────────────────────
    // CONTROLE DE CONFIANCE — sur les valeurs BRUTES lues (avant toute
    // correction, sinon on masquerait l'erreur). Si les invariants legaux
    // ne tiennent pas (bail manuscrit/scanne mal lu), on signale une faible
    // confiance : le front affichera "valeurs a confirmer" au lieu d'un
    // montant faux affiche avec aplomb.
    // ────────────────────────────────────────────────────────────
    try {
      var _surf = parseFloat(parsed.surface) || 0;
      var _base = parseFloat(parsed.loyer_base) || 0;
      var _comp = parseFloat(parsed.complement_loyer) || 0;
      var _lrm  = parseFloat(parsed.loyer_reference_majore) || 0;
      var _tot  = parseFloat(parsed.loyer_total_mensuel) || 0;
      if (!(_tot > 0) && _base > 0) _tot = Math.round((_base + _comp) * 100) / 100;
      var _tol = function (ref) { return Math.max(25, ref * 0.04); };
      var _flags = [];

      // a) base + complement doit egaler le loyer total (invariant du bail)
      if (_tot > 0 && _base > 0 && Math.abs((_base + _comp) - _tot) > _tol(_tot))
        _flags.push('loyer de base + complement (' + Math.round(_base + _comp) + ') different du loyer total (' + Math.round(_tot) + ')');

      // b) loyer/m2 invraisemblable -> surface tres probablement mal lue
      var _lm2 = (_surf > 0 && _base > 0) ? (_base / _surf) : 0;
      if (_lm2 > 45) _flags.push('loyer/m2 invraisemblable (' + _lm2.toFixed(1) + ' euros/m2) — surface probablement mal lue');

      // c) base TRES EN DESSOUS du loyer de reference majore x surface = probable mauvaise lecture
      //    (chiffre mal lu sur un scan). ATTENTION : une base AU-DESSUS du reference majore n'est
      //    PAS une erreur, c'est un loyer surfacture = la violation meme que l'on doit calculer.
      //    On ne flague donc QUE le cas "base anormalement basse", jamais le depassement.
      if (_lrm > 3 && _surf > 0 && _base > 0) {
        if (_base < _lrm * _surf * 0.4) _flags.push('loyer de base anormalement bas par rapport au loyer de reference majore x surface (lecture a verifier)');
      }

      if (_flags.length > 0) {
        parsed._extraction_low_confidence = true;
        parsed._extraction_flags = _flags;
        console.warn('[extract-doc] FAIBLE CONFIANCE:', _flags.join(' | '));
      }
    } catch (eRec) { console.warn('[extract-doc] controle confiance echoue:', eRec && eRec.message); }

    // FILET DETERMINISTE (entree texte) : si le modele n'a pas lu le loyer du
    // precedent locataire, on le cherche directement dans le texte du bail.
    // Mention obligatoire en zone tendue, donc tres reconnaissable.
    if (bailText && !(parseFloat(parsed.loyer_precedent_locataire) > 0)) {
      try {
        var _normNum = function (s) {
          var t = String(s).replace(/[\u00a0\s]/g, '');
          if (t.indexOf(',') > -1 && t.indexOf('.') > -1) t = t.replace(/\./g, '').replace(',', '.');
          else t = t.replace(',', '.');
          return parseFloat(t.replace(/[^\d.]/g, '')) || 0;
        };
        var _re = [
          /(?:dernier\s+loyer|loyer)[^\n.]{0,80}?pr[ée]c[ée]dent\s+locataire[^\n.]{0,50}?(\d[\d\u00a0 .,]*)\s*(?:euros?|€)/i,
          /pr[ée]c[ée]dent\s+locataire[^\n.]{0,60}?(\d[\d\u00a0 .,]*)\s*(?:euros?|€)/i,
          /loyer\s+(?:du\s+|de\s+l['’]?\s*)?(?:pr[ée]c[ée]dent|ancien)\s+locataire[^\n.]{0,40}?(\d[\d\u00a0 .,]*)\s*(?:euros?|€)/i
        ];
        var _hit = null;
        for (var _i = 0; _i < _re.length && !_hit; _i++) _hit = bailText.match(_re[_i]);
        if (_hit && _hit[1]) {
          var _pr = _normNum(_hit[1]);
          if (_pr > 50 && _pr < 20000) {
            parsed.loyer_precedent_locataire = _pr;
            console.log('[extract-doc] loyer precedent recupere par regex:', _pr);
            if (!(parseInt(parsed.annee_loyer_precedent, 10) > 0)) {
              var _ctx = bailText.slice(Math.max(0, (_hit.index || 0) - 10), (_hit.index || 0) + 220);
              var _ym = _ctx.match(/\b(20[0-3]\d)\b/);
              if (_ym) parsed.annee_loyer_precedent = parseInt(_ym[1], 10);
            }
          }
        }
      } catch (eReg) { console.warn('[extract-doc] regex loyer precedent echouee:', eReg && eReg.message); }
    }

    console.log('[extract-doc] OK — ville:', parsed.ville, '| loyer:', parsed.loyer_base, '| surface:', parsed.surface, '| complement:', parsed.complement_loyer, '| lowConf:', !!parsed._extraction_low_confidence);
    return parsed;
  } catch (e) {
    console.error('[extract-pdf] Erreur:', e && e.message);
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
    // MODE SKIP_FORM : ne PAS faire d'appel preliminaire (rate limit Anthropic).
    // On garde l'appel UNIQUE avec un prompt qui demande extraction + analyse.
    // ────────────────────────────────────────────────────────────
    var extractedContext = null;
    if (context._skip_form && type === 'bail' && (body.pdf || body.text)) {
      // PASSE D'EXTRACTION DEDIEE (Tier 2 : plus de contrainte 429).
      // But : remplir context AVANT la resolution du plafond et l'analyse,
      // pour juger le loyer avec un vrai plafond et chiffrer les honoraires.
      try {
        extractedContext = await extractContextFromDoc({ pdf: body.pdf, text: body.text });
      } catch (e) {
        console.warn('[handler] Extraction dediee echouee:', e && e.message);
      }
      if (extractedContext) {
        if (extractedContext.ville && !context.ville) context.ville = extractedContext.ville;
        if (extractedContext.code_postal && !context.code_postal) context.code_postal = extractedContext.code_postal;
        if (extractedContext.adresse && !context.adresse) context.adresse = extractedContext.adresse;
        if (extractedContext.surface && !context.surface) context.surface = extractedContext.surface;
        if (extractedContext.nb_pieces && !context.nb_pieces) context.nb_pieces = extractedContext.nb_pieces;
        if (extractedContext.annee_construction && !context.annee_construction) context.annee_construction = extractedContext.annee_construction;
        if (extractedContext.loyer_base && !context.loyer_base) context.loyer_base = extractedContext.loyer_base;
        if (extractedContext.charges !== undefined && (context.charges === undefined || context.charges === null)) context.charges = extractedContext.charges;
        if (extractedContext.depot !== undefined && !context.depot) context.depot = extractedContext.depot;
        if (extractedContext.type_bien && !context.type_bien) context.type_bien = extractedContext.type_bien;
        if (extractedContext.type_location && !context.type_location) context.type_location = extractedContext.type_location;
        if (extractedContext.complement_loyer !== undefined && !context.complement_loyer) context.complement_loyer = extractedContext.complement_loyer;
        if (extractedContext.complement_justif && !context.complement_justif) context.complement_justif = extractedContext.complement_justif;
        if (extractedContext.date_debut_bail && !context.date_debut_bail) context.date_debut_bail = extractedContext.date_debut_bail;
        if (extractedContext.loyer_reference_majore && !context.loyer_reference_majore) context.loyer_reference_majore = extractedContext.loyer_reference_majore;
        if (extractedContext.honoraires_agence !== undefined && (context.honoraires_agence === undefined || context.honoraires_agence === null)) context.honoraires_agence = extractedContext.honoraires_agence;
        if (extractedContext.frais_visite !== undefined && (context.frais_visite === undefined || context.frais_visite === null)) context.frais_visite = extractedContext.frais_visite;
        if (extractedContext.loyer_total_mensuel) context.loyer_total_mensuel = extractedContext.loyer_total_mensuel;
        if (extractedContext.loyer_precedent_locataire && !context.loyer_precedent_locataire) context.loyer_precedent_locataire = extractedContext.loyer_precedent_locataire;
        if (extractedContext.annee_loyer_precedent && !context.annee_loyer_precedent) context.annee_loyer_precedent = extractedContext.annee_loyer_precedent;
        if (extractedContext.premiere_location === true && context.premiere_location === undefined) context.premiere_location = true;
        if (extractedContext._extraction_low_confidence) {
          context._extraction_low_confidence = true;
          context._extraction_flags = extractedContext._extraction_flags || [];
        }
        console.log('[skip_form] Extraction dediee OK — ville:', context.ville, '| loyer:', context.loyer_base, '| surface:', context.surface, '| lowConf:', !!context._extraction_low_confidence);
      } else {
        console.warn('[handler] skip_form : extraction dediee sans resultat, fallback extraction integree');
      }
    } else if (context._skip_form) {
      console.log('[handler] Mode skip_form actif — extraction integree dans l\'appel principal');
    }

    // ────────────────────────────────────────────────────────────
    // SURFACE FIABILISEE PAR LE LOYER DE REFERENCE MAJORE IMPRIME
    // En zone encadree avec complement, loyer_base = loyer de reference majore (euros/m2) x surface
    // (mention obligatoire du bail). Le LRM imprime + le loyer de base sont plus fiables que l'OCR
    // de la surface manuscrite : on en rededuit la surface quand l'ecart est net.
    // ────────────────────────────────────────────────────────────
    try {
      var _lrmB = parseFloat(context.loyer_reference_majore) || 0;
      var _baseB = parseFloat(context.loyer_base) || 0;
      var _surfB = parseFloat(context.surface) || 0;
      if (_lrmB > 3 && _lrmB < 60 && _baseB > 0) {
        var _surfDeriv = Math.round((_baseB / _lrmB) * 10) / 10;
        if (_surfDeriv >= 8 && _surfDeriv <= 400 && (!_surfB || Math.abs(_surfDeriv - _surfB) / _surfDeriv > 0.05)) {
          console.log('[surface] rededuite depuis loyer_base/LRM imprime:', _surfB, '->', _surfDeriv);
          context.surface = _surfDeriv;
          context._surface_derivee = true;
          context.nb_pieces = context.nb_pieces || estimateNbPieces(_surfDeriv);
        }
      }
    } catch (eSurf) { console.warn('[surface] derivation echouee:', eSurf && eSurf.message); }

    // ────────────────────────────────────────────────────────────
    // RESOLUTION DU PLAFOND avec le contexte (peut etre vide en skip_form,
    // dans ce cas le plafond ne sera pas pre-resolu et sera traite par
    // le frontend fallback)
    // ────────────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────────────
    // ENCADREMENT PRECISION QUARTIER (adresse -> geocode BAN -> polygone).
    // Marche pour toute ville ayant un fichier api/data/<ville>-loyers.json.
    // Prioritaire sur la grille secteur. Repli automatique si echec/adresse absente.
    // ────────────────────────────────────────────────────────────
    if (type === 'bail' && context.loyer_base && context.surface) {
      var vkQ = normaliseVille(context.ville);
      var qEngine = getQuartierEngine();
      var qData = vkQ ? getQuartierData(vkQ) : null;
      if (qEngine && qData) {
        try {
          var pq = await qEngine.resolveQuartier(qData, {
            adresse: context.adresse,
            codePostal: context.code_postal,
            nbPieces: context.nb_pieces || estimateNbPieces(context.surface),
            epoque: context.annee_construction ? devineEpoque(context.annee_construction) : null,
            typeBien: context.type_bien || 'vide'
          });
          if (pq && pq.hors_encadrement) {
            context._plafondInfo = pq;
            console.log('[quartier]', vkQ, '→', pq.quartier, ': HORS perimetre d\'encadrement');
          } else if (pq) {
            context._plafondInfo = pq;
            console.log('[quartier]', vkQ, '→', pq.quartier, pq.plafond_m2, '€/m²');
          } else {
            console.log('[quartier]', vkQ, ': pas de quartier (adresse absente/hors zone) → fallback secteur');
          }
        } catch (e) {
          console.warn('[quartier] echec:', e && e.message);
        }
      }
    }

    // Grenoble : les 13 communes INTEGRALEMENT encadrees relevent toutes de la Zone A.
    // (Grenoble ville est traitee par le moteur IRIS ci-dessus ; les 8 communes
    //  partiellement encadrees restent en estimation faute de polygones IRIS.)
    if (!context._plafondInfo && normaliseVille(context.ville) === 'grenoble' && !(context && context.encadrement_zone)) {
      var _gv = (context.ville || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      var _fullA = ['bresson', 'claix', 'domene', 'eybens', 'fontanil', 'gieres', 'meylan', 'murianette', 'poisat', 'tronche', 'seyssins', 'varces', 'venon'];
      if (_fullA.some(function (c) { return _gv.indexOf(c) >= 0; })) {
        context.encadrement_zone = 'A';
        console.log('[grenoble] commune integralement encadree → Zone A:', context.ville);
      }
    }

    // Pays Basque : 21 communes entierement dans une zone (1/2/3) -> resolues par commune.
    // Les 3 communes scindees au niveau rue (Anglet, Bayonne, Ciboure) restent en estimation
    // (moyenne des zones) faute de polygones — a preciser avec le zonage vectoriel geoBasque.
    if (!context._plafondInfo && normaliseVille(context.ville) === 'pays-basque' && !(context && context.encadrement_zone)) {
      var _pv = (context.ville || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-']/g, ' ').replace(/\s+/g, ' ');
      var _pbZ1 = ['arcangues', 'biarritz', 'bidart', 'guethary', 'jean de luz'];
      var _pbZ2 = ['ahetze', 'arbonne', 'ascain', 'bassussarry', 'urrugne'];
      var _pbZ3 = ['biriatou', 'boucau', 'hendaye', 'jatxou', 'lahonce', 'larressore', 'mouguerre', 'irube', 'urcuit', 'ustaritz', 'villefranque'];
      var _pbZone = _pbZ1.some(function (c) { return _pv.indexOf(c) >= 0; }) ? '1'
                  : _pbZ2.some(function (c) { return _pv.indexOf(c) >= 0; }) ? '2'
                  : _pbZ3.some(function (c) { return _pv.indexOf(c) >= 0; }) ? '3' : '';
      if (_pbZone) {
        context.encadrement_zone = _pbZone;
        console.log('[pays-basque] commune entiere → Zone', _pbZone, ':', context.ville);
      } else {
        console.log('[pays-basque] commune scindee (Anglet/Bayonne/Ciboure) → estimation moyenne:', context.ville);
      }
    }

    if (!context._plafondInfo && type === 'bail' && context.ville && context.loyer_base && context.surface) {
      try {
        var plafondResolved = await resolveLoyerPlafond({
          zone: (context && context.encadrement_zone) || '',
          ville: context.ville,
          nbPieces: context.nb_pieces || estimateNbPieces(context.surface),
          epoque: context.annee_construction ? devineEpoque(context.annee_construction) : null,
          typeBien: context.type_bien || 'vide',
          quartier: context.code_postal || context.quartier || context.ville
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
 
    // Tokens output adaptatifs :
    // - mode normal : 1800
    // - extra_docs : 2800
    // - skip_form (extraction + analyse dans le meme appel) : 3500
    var maxTokensAnalysis = 1800;
    if (extraDocs.length > 0) maxTokensAnalysis = 2800;
    if (context._skip_form) maxTokensAnalysis = Math.max(maxTokensAnalysis, 3500);
    console.log('[analyze] max_tokens output:', maxTokensAnalysis, 'skip_form:', !!context._skip_form);
 
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

    console.log('[analyze] Envoi a Claude — mode:', body.pdf ? 'PDF' : 'TEXT',
      '| skip_form:', !!(context && context._skip_form),
      '| pdf size:', body.pdf ? Math.round(body.pdf.length * 0.75 / 1024) + ' Ko' : 'n/a',
      '| ville context:', (context && context.ville) || '(vide)',
      '| loyer context:', (context && context.loyer_base) || 0);

    var data = await callAnthropic(
      [{ role: "user", content: userContent }],
      systemPrompt, maxTokensAnalysis
    );
 
    var rawText = (data.content && data.content[0] && data.content[0].text) || '';
    console.log('[analyze] Reponse Claude recue. stop_reason:', data.stop_reason,
      '| usage:', JSON.stringify(data.usage || {}),
      '| rawText length:', rawText.length);
    if (data.stop_reason === 'max_tokens') {
      console.warn('[analyze] ⚠️ JSON probablement tronque (max_tokens atteint). Considere augmenter max_tokens.');
    }
    var parsed;
 
    try {
      var clean = rawText.replace(/```json/g, '').replace(/```/g, '');
      var firstBrace = clean.indexOf('{');
      var lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
      parsed = JSON.parse(clean.trim());
      console.log('[parse] JSON OK — clauses:', (parsed.clauses_abusives || []).length,
        '| context_extrait:', !!parsed.context_extrait);
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
        // Message d'erreur contextuel
        var skipForm = context && (context._skip_form || context._skip_form_processed);
        // Detail technique de l'erreur pour diagnostic
        var rawPreview = (rawText || '').slice(0, 600).replace(/\n+/g, ' ');
        var errorDetails = {
          erreur_parse: e2 && e2.message ? e2.message : 'inconnu',
          stop_reason_claude: (data && data.stop_reason) || 'inconnu',
          tokens_utilises: (data && data.usage) ? JSON.stringify(data.usage) : 'inconnu',
          longueur_reponse_claude: (rawText || '').length,
          extrait_reponse_claude: rawPreview || '(vide — Claude n\'a rien renvoye)',
          context_extrait_reussi: !!extractedContext,
          ville_utilisee: context && context.ville,
          loyer_utilise: context && context.loyer_base
        };
        console.error('[parse-fail] Details:', JSON.stringify(errorDetails, null, 2));

        var errMsg = skipForm
          ? "L'analyse automatique a echoue. Voir details techniques ci-dessous, puis essayer de remplir le formulaire manuellement."
          : "L'analyse a rencontre un probleme. Voir details techniques ci-dessous.";
        return res.status(200).json({
          score: 50, verdict: 'Risque',
          verdict_titre: 'Analyse partielle',
          resume: errMsg,
          loyer: null, clauses_abusives: [],
          plan_action: skipForm
            ? ['Revenir en arriere', 'Cliquer "Continuer → Logement"', 'Saisir les infos manuellement', 'Relancer l\'analyse']
            : ['Reessayer en collant le texte du bail dans le champ texte'],
          _partial: true,
          _skip_form_failed: skipForm || false,
          _debug: errorDetails
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
    // On expose aussi le contexte extrait du PDF pour que le frontend hydrate appState
    // (ville, loyer, surface, depot, etc. necessaires pour le bloc Comparaison marche
    // et le fallback frontend si jamais le backend n'a pas force le plafond).
    if (extractedContext) parsed.context_extrait = extractedContext;
 
    return res.status(200).json(parsed);
 
  } catch (error) {
    console.error('BailScan error:', error);
    // Detection erreur rate limit Anthropic (429)
    var errMsg = error && error.message ? error.message : 'erreur inconnue';
    if (errMsg.indexOf('429') >= 0 || errMsg.indexOf('rate_limit') >= 0) {
      return res.status(200).json({
        score: 50, verdict: 'Risque',
        verdict_titre: 'Service momentanément saturé',
        resume: "Trop de requêtes en cours. Attendez 60 secondes et relancez l'analyse.",
        loyer: null, clauses_abusives: [],
        plan_action: ['Attendre 1 minute', 'Relancer l\'analyse en cliquant sur "Analyser mon bail" en haut'],
        _partial: true,
        _rate_limit: true,
        _debug: { erreur_type: 'rate_limit_anthropic', detail: errMsg.slice(0, 300) }
      });
    }
    return res.status(500).json({ error: 'Erreur serveur: ' + errMsg });
  }
};
