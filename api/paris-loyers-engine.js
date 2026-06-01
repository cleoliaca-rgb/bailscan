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

// ── 4) RÉSOLUTION : coordonnées → quartier → loyer ──
// data = { annee, quartiers:[{id,nom,zone,geometry}], loyers:{ "<qid>_<piece>_<epoqueDS>_<meubleDS>": {ref,max,min} } }
function findQuartier(data, lon, lat) {
  if (!data || !data.quartiers) return null;
  for (var i = 0; i < data.quartiers.length; i++) {
    if (pointInGeometry(lon, lat, data.quartiers[i].geometry)) return data.quartiers[i];
  }
  return null;
}

function lookupLoyer(data, quartier, piece, epoqueKey, typeBien) {
  if (!quartier) return null;
  var p = Math.min(Math.max(parseInt(piece || 1, 10) || 1, 1), 4);
  var ep = epoqueToDataset(epoqueKey);
  var mb = meubleToDataset(typeBien);
  // cascade : exact → autres époques (même pièces/type) → pièces voisines → type alternatif
  var epoques = [ep, 'Apres 1990', '1971-1990', '1946-1970', 'Avant 1946'];
  var pieces = [p, Math.max(1, p - 1), Math.min(4, p + 1), 1, 2, 3, 4];
  var types = [mb, mb === 'meuble' ? 'nonmeuble' : 'meuble'];
  for (var ti = 0; ti < types.length; ti++)
    for (var pi = 0; pi < pieces.length; pi++)
      for (var ei = 0; ei < epoques.length; ei++) {
        var key = quartier.id + '_' + pieces[pi] + '_' + epoques[ei] + '_' + types[ti];
        if (data.loyers[key]) {
          var row = data.loyers[key];
          return {
            plafond_m2: row.max,
            ref_m2: row.ref,
            minore_m2: row.min,
            quartier: quartier.nom,
            zone: quartier.zone,
            annee: data.annee,
            encadrement_actif: true,
            indicatif: false,
            source: 'Paris ' + data.annee + ' quartier ' + quartier.nom
          };
        }
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
  return lookupLoyer(data, q, opts.nbPieces, opts.epoque, opts.typeBien);
}
// alias rétro-compat
var resolveParisQuartier = resolveQuartier;

module.exports = {
  pointInRing, pointInGeometry, geocodeBAN,
  findQuartier, lookupLoyer, resolveQuartier, resolveParisQuartier,
  epoqueToDataset, meubleToDataset
};
