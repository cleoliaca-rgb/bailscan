// ─────────────────────────────────────────────────────────────
// BUILD GENERIQUE — export open data encadrement -> api/data/<ville>-loyers.json
// Usage : node build-loyers.js <ville> <export.json|geojson> [sortie.json] [--map=map.json]
//   <ville>     : cle de ville (doit matcher normaliseVille dans analyze.js : paris, lyon, lille,
//                 bordeaux, montpellier, grenoble, bayonne, plaine-commune, est-ensemble...)
//   <export>    : fichier exporte depuis le portail open data (records JSON, array, ou GeoJSON)
//   --map       : (optionnel) JSON de correspondance de colonnes si l'auto-detection echoue
//                 ex : {"id_quartier":"code_zone","nom_quartier":"libelle","max":"loyer_majore"}
//
// Auto-detecte les noms de colonnes (chaque portail diffère). Garde la derniere annee.
// Sortie compatible avec paris-loyers-engine.js (point-in-polygon + lookup).
// ─────────────────────────────────────────────────────────────
'use strict';
var fs = require('fs');

// alias de colonnes par champ logique (ordre = priorite)
var ALIASES = {
  annee:       ['annee', 'year', 'millesime', 'anneref', 'an'],
  id_quartier: ['id_quartier', 'quartier_id', 'code_quartier', 'code_grand_quartier', 'id_zone', 'id_secteur', 'code_zone', 'secteur', 'zone', 'gid', 'objectid'],
  nom_quartier:['nom_quartier', 'quartier', 'nom_secteur', 'libelle_zone', 'libelle', 'nom_zone', 'nom', 'secteur_nom'],
  id_zone:     ['id_zone', 'zone', 'secteur', 'id_secteur'],
  piece:       ['piece', 'pieces', 'nb_piece', 'nb_pieces', 'nombre_pieces', 'piece_principale', 'nb_pieces_principales'],
  epoque:      ['epoque', 'epoque_construction', 'periode_construction', 'periode', 'annee_construction', 'construction'],
  meuble:      ['meuble_txt', 'meuble', 'type_location', 'meuble_non_meuble', 'loue_meuble', 'meuble'],
  ref:         ['ref', 'loyer_reference', 'loyer_de_reference', 'loyer_ref', 'reference', 'loyer_median'],
  max:         ['max', 'loyer_reference_majore', 'loyer_majore', 'majore', 'ref_majore', 'loyer_max', 'loyer_reference_majoré'],
  min:         ['min', 'loyer_reference_minore', 'loyer_minore', 'minore', 'loyer_min', 'loyer_reference_minoré'],
  geometry:    ['geo_shape', 'geometry', 'geo_shape_geometry', 'geom', 'geo_2d_shape']
};

function detectFields(sample, override) {
  var keys = Object.keys(sample);
  var lower = {}; keys.forEach(function (k) { lower[k.toLowerCase()] = k; });
  var map = {};
  Object.keys(ALIASES).forEach(function (field) {
    if (override && override[field]) { map[field] = override[field]; return; }
    for (var i = 0; i < ALIASES[field].length; i++) {
      var a = ALIASES[field][i].toLowerCase();
      if (lower[a]) { map[field] = lower[a]; break; }
    }
  });
  return map;
}

function geomOf(val) {
  if (!val) return null;
  if (val.geometry && val.geometry.type) return val.geometry;     // Feature
  if (val.type && val.coordinates) return val;                    // geometry directe
  return null;
}

function normEpoque(e) {
  var t = String(e == null ? '' : e).toLowerCase();
  if (t.indexOf('avant') >= 0) return 'Avant 1946';
  if (t.indexOf('1946') >= 0 && t.indexOf('1971') < 0) return '1946-1970';
  if (t.indexOf('1971') >= 0) return '1971-1990';
  if (t.indexOf('1946') >= 0) return '1946-1970';
  return 'Apres 1990';
}
function normMeuble(m) {
  var t = String(m == null ? '' : m).toLowerCase().trim();
  if (t.indexOf('non') >= 0) return 'nonmeuble';
  if (t === 'oui' || t === 'true' || t === '1' || t.indexOf('meubl') >= 0) return 'meuble';
  return 'nonmeuble';
}
function normPiece(p) {
  var m = String(p == null ? '' : p).match(/\d+/);
  var n = m ? parseInt(m[0], 10) : 0;
  if (!n) return 0;
  return Math.min(Math.max(n, 1), 4);
}
function round6(geom) {
  if (!geom || !geom.coordinates) return geom;
  function r(c) { return typeof c[0] === 'number' ? [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6] : c.map(r); }
  return { type: geom.type, coordinates: geom.coordinates.map(r) };
}

function extractRecords(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw.results) return raw.results;
  if (raw.features) return raw.features.map(function (f) { return Object.assign({}, f.properties, { __geom: f.geometry }); });
  if (raw.records) return raw.records.map(function (r) { return r.fields || (r.record && r.record.fields) || r; });
  throw new Error('Format export non reconnu');
}

function build(ville, inputPath, outPath, overridePath) {
  var raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  var recs = extractRecords(raw);
  if (!recs.length) throw new Error('Export vide');
  var override = overridePath ? JSON.parse(fs.readFileSync(overridePath, 'utf8')) : null;
  var F = detectFields(recs[0], override);

  // controle : champs essentiels detectes ?
  ['id_quartier', 'piece', 'epoque', 'meuble', 'max'].forEach(function (need) {
    if (!F[need]) throw new Error('Colonne "' + need + '" non detectee. Champs dispo : ' + Object.keys(recs[0]).join(', ') + '\n→ relance avec --map={"' + need + '":"<nom_colonne>"}');
  });
  console.log('Colonnes detectees :', JSON.stringify(F));

  function val(rec, field) { return F[field] ? rec[F[field]] : undefined; }
  function geomFor(rec) {
    if (rec.__geom) return rec.__geom;
    return geomOf(val(rec, 'geometry'));
  }

  var maxAnnee = 0;
  if (F.annee) recs.forEach(function (r) { var a = parseInt(val(r, 'annee'), 10); if (a && a > maxAnnee) maxAnnee = a; });

  var quartiers = {}, loyers = {}, kept = 0;
  recs.forEach(function (rec) {
    if (F.annee && maxAnnee && parseInt(val(rec, 'annee'), 10) !== maxAnnee) return;
    var qid = val(rec, 'id_quartier');
    if (qid == null || qid === '') return;
    qid = String(qid);
    if (!quartiers[qid]) {
      var g = geomFor(rec);
      if (g) quartiers[qid] = { id: qid, nom: val(rec, 'nom_quartier') || qid, zone: val(rec, 'id_zone'), geometry: round6(g) };
    }
    var piece = normPiece(val(rec, 'piece'));
    if (!piece) return;
    var key = qid + '_' + piece + '_' + normEpoque(val(rec, 'epoque')) + '_' + normMeuble(val(rec, 'meuble'));
    loyers[key] = {
      ref: Number(val(rec, 'ref')),
      max: Number(val(rec, 'max')),
      min: Number(val(rec, 'min'))
    };
    kept++;
  });

  var nbGeo = Object.keys(quartiers).filter(function (k) { return quartiers[k].geometry; }).length;
  var out = {
    _meta: { ville: ville, annee: maxAnnee || null, source: inputPath, genere_le: new Date().toISOString().slice(0, 10) },
    annee: maxAnnee || null,
    quartiers: Object.keys(quartiers).map(function (k) { return quartiers[k]; }),
    loyers: loyers
  };
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log('OK -> ' + outPath);
  console.log('  ville: ' + ville + ' | annee: ' + (maxAnnee || 'n/a'));
  console.log('  quartiers: ' + out.quartiers.length + ' (avec polygone: ' + nbGeo + ')');
  console.log('  combinaisons loyers: ' + kept);
  console.log('  taille: ' + Math.round(fs.statSync(outPath).size / 1024) + ' Ko');
  if (nbGeo === 0) console.warn('  ⚠ AUCUN polygone — ce dataset ne contient pas les geometries. Il faut le jeu "zonage"/geojson de la ville (voir notes).');
  return out;
}

if (require.main === module) {
  var args = process.argv.slice(2);
  var mapArg = args.filter(function (a) { return a.indexOf('--map=') === 0; })[0];
  var pos = args.filter(function (a) { return a.indexOf('--') !== 0; });
  var ville = pos[0], input = pos[1], output = pos[2] || (ville + '-loyers.json');
  if (!ville || !input) { console.error('Usage: node build-loyers.js <ville> <export.json> [sortie.json] [--map=map.json]'); process.exit(1); }
  build(ville, input, output, mapArg ? mapArg.slice(6) : null);
}
module.exports = { build, detectFields, normEpoque, normMeuble, normPiece };
