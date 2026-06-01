// ─────────────────────────────────────────────────────────────
// MOTEUR ENCADREMENT PARIS — précision au quartier (comme l'outil officiel Paris.fr)
// Données : opendata.paris.fr "logement-encadrement-des-loyers" (open data, MAJ chaque 1er juillet)
// Pipeline : adresse → géocodage BAN → point-in-polygon (quartier) → loyer de référence majoré
// ─────────────────────────────────────────────────────────────

'use strict';

// ── 1) POINT-IN-POLYGON (ray casting), gère Polygon (avec trous) + MultiPolygon ──
function pointInRing(lon, lat, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1];
    var xj = ring[j][0], yj = ring[j][1];
    var intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  if (!geometry || !geometry.coordinates) return false;
  if (geometry.type === 'Polygon') {
    var rings = geometry.coordinates;
    if (!rings.length || !pointInRing(lon, lat, rings[0])) return false;
    for (var h = 1; h < rings.length; h++) {
      if (pointInRing(lon, lat, rings[h])) return false; // dans un trou
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (var p = 0; p < geometry.coordinates.length; p++) {
      var poly = geometry.coordinates[p];
      if (poly.length && pointInRing(lon, lat, poly[0])) {
        var inHole = false;
        for (var hh = 1; hh < poly.length; hh++) {
          if (pointInRing(lon, lat, poly[hh])) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }
  return false;
}

// ── 2) GÉOCODAGE via la Base Adresse Nationale (API officielle gratuite, sans clé) ──
async function geocodeBAN(adresse, codePostal) {
  if (!adresse && !codePostal) return null;
  try {
    var q = encodeURIComponent((adresse || '') + (codePostal ? ' ' + codePostal : ''));
    var url = 'https://api-adresse.data.gouv.fr/search/?q=' + q + '&limit=1';
    if (codePostal) url += '&postcode=' + encodeURIComponent(codePostal);
    var r = await fetch(url);
    if (!r.ok) return null;
    var d = await r.json();
    if (!d.features || !d.features.length) return null;
    var f = d.features[0];
    return {
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      score: f.properties.score,
      citycode: f.properties.citycode,
      label: f.properties.label
    };
  } catch (e) {
    console.warn('[paris-quartier] geocode BAN echec:', e && e.message);
    return null;
  }
}

// ── 3) MAPPING de nos clés internes vers les valeurs du dataset ──
function epoqueToDataset(epoqueKey) {
  switch (epoqueKey) {
    case 'avant1946': return 'Avant 1946';
    case '1946-70':   return '1946-1970';
    case '1971-90':   return '1971-1990';
    default:          return 'Apres 1990';
  }
}
function meubleToDataset(typeBien) {
  return /meubl/i.test(typeBien || '') ? 'meuble' : 'nonmeuble';
}

// ── 3bis) DISTANCE point→polygone (pour repli "zone la plus proche") ──
function distPointSeg(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var cx = ax + t * dx, cy = ay + t * dy, ex = px - cx, ey = py - cy;
  return ex * ex + ey * ey; // distance au carré
}
function distToRing(lon, lat, ring) {
  var min = Infinity;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var d = distPointSeg(lon, lat, ring[j][0], ring[j][1], ring[i][0], ring[i][1]);
    if (d < min) min = d;
  }
  return min;
}
function distToGeometry(lon, lat, geometry) {
  if (!geometry || !geometry.coordinates) return Infinity;
  var min = Infinity, r;
  if (geometry.type === 'Polygon') {
    for (r = 0; r < geometry.coordinates.length; r++) { var d = distToRing(lon, lat, geometry.coordinates[r]); if (d < min) min = d; }
  } else if (geometry.type === 'MultiPolygon') {
    for (var p = 0; p < geometry.coordinates.length; p++)
      for (r = 0; r < geometry.coordinates[p].length; r++) { var d2 = distToRing(lon, lat, geometry.coordinates[p][r]); if (d2 < min) min = d2; }
  }
  return min;
}
function dataBBox(data) {
  if (data._bbox) return data._bbox;
  var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  function walk(c) {
    if (typeof c[0] === 'number') { if (c[0] < minx) minx = c[0]; if (c[0] > maxx) maxx = c[0]; if (c[1] < miny) miny = c[1]; if (c[1] > maxy) maxy = c[1]; }
    else for (var i = 0; i < c.length; i++) walk(c[i]);
  }
  for (var q = 0; q < data.quartiers.length; q++) if (data.quartiers[q].geometry) walk(data.quartiers[q].geometry.coordinates);
  data._bbox = { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
  return data._bbox;
}

// ── 4) RÉSOLUTION : coordonnées → quartier → loyer ──
// data = { annee, quartiers:[{id,nom,zone,geometry}], loyers:{ "<qid>_<piece>_<epoqueDS>_<meubleDS>": {ref,max,min} } }
function findQuartier(data, lon, lat) {
  if (!data || !data.quartiers) return null;
  for (var i = 0; i < data.quartiers.length; i++) {
    if (pointInGeometry(lon, lat, data.quartiers[i].geometry)) return data.quartiers[i];
  }
  // Repli "zone la plus proche" : UNIQUEMENT pour les zonages "partition" (peu de polygones
  // censés couvrir toute la commune, ex Montpellier) et seulement dans l'emprise de la ville.
  // N'affecte PAS Paris/Lyon/Bordeaux (zonage IRIS précis, pas de flag → repli ignoré).
  if (data._meta && data._meta.zone_partition) {
    var bb = dataBBox(data), m = 0.01; // ~1 km de marge autour de l'emprise
    if (lon >= bb.minx - m && lon <= bb.maxx + m && lat >= bb.miny - m && lat <= bb.maxy + m) {
      var best = null, bestd = Infinity;
      for (var k = 0; k < data.quartiers.length; k++) {
        var dd = distToGeometry(lon, lat, data.quartiers[k].geometry);
        if (dd < bestd) { bestd = dd; best = data.quartiers[k]; }
      }
      if (best && bestd <= 0.02 * 0.02) return best; // <= ~2 km du bord le plus proche
    }
  }
  return null;
}

function lookupLoyer(data, quartier, piece, epoqueKey, typeBien) {
  if (!quartier) return null;
  var villeLabel = (data._meta && data._meta.ville) ? data._meta.ville.charAt(0).toUpperCase() + data._meta.ville.slice(1) : 'Encadrement';
  var mb = meubleToDataset(typeBien);
  var TOUTES_EP = ['Avant 1946', '1946-1970', '1971-1990', 'Apres 1990'];

  // Une info manquante (null/'moyenne') => on MOYENNE sur cette dimension au lieu de deviner une valeur unique
  var avgEpoque = (epoqueKey == null || epoqueKey === 'moyenne');
  var avgPiece = (piece == null || piece === 'moyenne');
  var p = avgPiece ? null : Math.min(Math.max(parseInt(piece || 1, 10) || 1, 1), 4);

  var pieces = avgPiece ? [1, 2, 3, 4] : [p];
  var epoques = avgEpoque ? TOUTES_EP : [epoqueToDataset(epoqueKey)];
  var types = [mb, mb === 'meuble' ? 'nonmeuble' : 'meuble'];

  function build(row, estimation, notes) {
    var globalEstim = data._meta && data._meta.estimation_globale;
    if (globalEstim) {
      estimation = true;
      notes = (notes || []).slice();
      if (data._meta.estimation_note && notes.indexOf(data._meta.estimation_note) === -1) notes.push(data._meta.estimation_note);
    }
    return {
      plafond_m2: Math.round(row.max * 10) / 10,
      ref_m2: Math.round(row.ref * 10) / 10,
      minore_m2: Math.round(row.min * 10) / 10,
      quartier: quartier.nom, zone: quartier.zone, annee: data.annee,
      encadrement_actif: true, indicatif: false,
      estimation: !!estimation,
      estimation_note: (notes && notes.length) ? notes.join(' + ') : null,
      source: villeLabel + ' ' + data.annee + ' — ' + quartier.nom
    };
  }

  // 1) Collecte des lignes correspondant aux dimensions connues (et moyenne sur les inconnues)
  for (var ti = 0; ti < types.length; ti++) {
    var rows = [];
    for (var pi = 0; pi < pieces.length; pi++)
      for (var ei = 0; ei < epoques.length; ei++) {
        var r = data.loyers[quartier.id + '_' + pieces[pi] + '_' + epoques[ei] + '_' + types[ti]];
        if (r) rows.push(r);
      }
    if (rows.length) {
      var sx = 0, sr = 0, sn = 0;
      rows.forEach(function (r) { sx += r.max; sr += r.ref; sn += r.min; });
      var n = rows.length;
      var notes = [];
      if (avgEpoque) notes.push('époque de construction non renseignée — moyenne des époques');
      if (avgPiece) notes.push('nombre de pièces non renseigné — moyenne des typologies');
      var estimation = avgEpoque || avgPiece || ti > 0;
      return build({ max: sx / n, ref: sr / n, min: sn / n }, estimation, notes);
    }
  }

  // 2) Filet de complétude : si la clé attendue n'existe pas dans les données, on élargit
  var epFallback = [epoqueToDataset(epoqueKey), 'Apres 1990', '1971-1990', '1946-1970', 'Avant 1946'];
  var pcFallback = avgPiece ? [1, 2, 3, 4] : [p, Math.max(1, p - 1), Math.min(4, p + 1), 1, 2, 3, 4];
  for (var t2 = 0; t2 < types.length; t2++)
    for (var p2 = 0; p2 < pcFallback.length; p2++)
      for (var e2 = 0; e2 < epFallback.length; e2++) {
        var rr = data.loyers[quartier.id + '_' + pcFallback[p2] + '_' + epFallback[e2] + '_' + types[t2]];
        if (rr) return build(rr, true, ['valeur approchée (donnée exacte indisponible)']);
      }
  return null;
}

// API principale : adresse (déjà géocodée OU à géocoder) → plafond précis au quartier.
// Agnostique à la ville : le filtre géographique est le point-in-polygon lui-même
// (si l'adresse géocodée tombe hors de tous les quartiers du dataset → null → repli grille).
// opts.citycodePrefix (optionnel) ajoute un garde-fou commune (ex: '75' pour Paris).
async function resolveQuartier(data, opts) {
  if (!data || !data.quartiers || !data.quartiers.length) return null;
  var lon = opts.lon, lat = opts.lat;
  if ((lon == null || lat == null)) {
    var geo = await geocodeBAN(opts.adresse, opts.codePostal);
    if (!geo) return null;
    var prefix = opts.citycodePrefix || (data._meta && data._meta.citycode_prefix);
    if (prefix && geo.citycode && String(geo.citycode).indexOf(String(prefix)) !== 0) return null;
    lon = geo.lon; lat = geo.lat;
  }
  var q = findQuartier(data, lon, lat);
  if (!q) return null;
  // IRIS explicitement hors encadrement (ex : Grenoble zone 3) : on le signale au lieu de retomber sur une moyenne.
  if (q.encadre === false) {
    return { hors_encadrement: true, quartier: q.nom, zone: q.zone, ville: (data._meta && data._meta.ville) || null, encadrement_actif: false };
  }
  return lookupLoyer(data, q, opts.nbPieces, opts.epoque, opts.typeBien);
}
// alias rétro-compat
var resolveParisQuartier = resolveQuartier;

module.exports = {
  pointInRing, pointInGeometry, geocodeBAN,
  findQuartier, lookupLoyer, resolveQuartier, resolveParisQuartier,
  epoqueToDataset, meubleToDataset
};
