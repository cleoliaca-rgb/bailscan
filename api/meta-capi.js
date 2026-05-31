/**
 * BailScan — Meta Conversions API (CAPI) helper
 *
 * Envoie les events server-side a Meta pour palier les pertes iOS14/ITP/AdBlock.
 * A appeler depuis le webhook Stripe apres confirmation paiement, en utilisant
 * le meme event_id que le pixel client (= session_id Stripe) pour deduplication.
 *
 * Variables d'environnement Vercel requises :
 *   META_PIXEL_ID         → 4338666489686062 (ton pixel)
 *   META_CAPI_ACCESS_TOKEN → genere dans Events Manager → Settings → Generate Access Token
 *   META_TEST_EVENT_CODE   → optionnel, pour tester sans polluer la prod (ex: TEST12345)
 *
 * Doc : https://developers.facebook.com/docs/marketing-api/conversions-api/
 */

import crypto from 'crypto';

// SHA-256 hash (requis par Meta pour PII : email, phone, name, etc.)
function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

/**
 * Envoie un event Meta CAPI.
 *
 * @param {Object} opts
 * @param {string} opts.eventName       — "Purchase", "InitiateCheckout", etc.
 * @param {string} opts.eventId         — session_id Stripe ou UUID partage avec le pixel client
 * @param {number} opts.value           — montant (29.00 pour BailScan)
 * @param {string} opts.currency        — "EUR"
 * @param {string} [opts.email]         — email du client (sera hashe automatiquement)
 * @param {string} [opts.phone]         — telephone (sera hashe)
 * @param {string} [opts.firstName]     — prenom (sera hashe)
 * @param {string} [opts.lastName]      — nom (sera hashe)
 * @param {string} [opts.city]          — ville (sera hashe)
 * @param {string} [opts.country]       — "FR" (sera hashe)
 * @param {string} [opts.fbp]           — cookie _fbp si tu l'as recupere du frontend
 * @param {string} [opts.fbc]           — cookie _fbc si tu l'as recupere du frontend
 * @param {string} [opts.userAgent]     — User-Agent du browser
 * @param {string} [opts.clientIp]      — IP du client (request.headers['x-forwarded-for'])
 * @param {string} [opts.sourceUrl]     — URL de la page (https://bailscan.app/analyser)
 * @param {string} [opts.eventSourceUrl] — URL source si different
 * @param {string} [opts.transactionId] — id transaction (utile pour Purchase)
 * @returns {Promise<{ok: boolean, response: any, error?: string}>}
 */
export async function sendMetaCAPI(opts) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE; // optionnel

  if (!pixelId || !accessToken) {
    console.warn('[meta-capi] META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN manquant — event non envoye');
    return { ok: false, error: 'env_missing' };
  }

  // Build user_data (toutes les valeurs PII doivent etre sha256)
  const userData = {};
  if (opts.email) userData.em = sha256(opts.email);
  if (opts.phone) userData.ph = sha256(opts.phone.replace(/[^\d]/g, ''));
  if (opts.firstName) userData.fn = sha256(opts.firstName);
  if (opts.lastName) userData.ln = sha256(opts.lastName);
  if (opts.city) userData.ct = sha256(opts.city);
  if (opts.country) userData.country = sha256(opts.country);
  if (opts.fbp) userData.fbp = opts.fbp;
  if (opts.fbc) userData.fbc = opts.fbc;
  if (opts.clientIp) userData.client_ip_address = opts.clientIp;
  if (opts.userAgent) userData.client_user_agent = opts.userAgent;
  if (opts.externalId) userData.external_id = sha256(opts.externalId);

  // Custom data
  const customData = {
    currency: opts.currency || 'EUR'
  };
  if (typeof opts.value === 'number') customData.value = opts.value;
  if (opts.transactionId) customData.order_id = opts.transactionId;
  customData.content_ids = ['bailscan_tenant_29'];
  customData.content_type = 'product';
  customData.content_name = 'BailScan Analyse Complete';
  customData.content_category = 'lease_analysis';

  // Event payload
  const eventData = {
    event_name: opts.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId,
    event_source_url: opts.eventSourceUrl || opts.sourceUrl || 'https://bailscan.app/analyser',
    action_source: 'website',
    user_data: userData,
    custom_data: customData
  };

  const payload = { data: [eventData] };
  if (testEventCode) payload.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await r.json();
    if (!r.ok) {
      console.error('[meta-capi] Echec', r.status, JSON.stringify(body).slice(0, 500));
      return { ok: false, response: body, error: 'http_' + r.status };
    }
    console.log('[meta-capi] OK', opts.eventName, 'eventId:', opts.eventId, '| events_received:', body.events_received);
    return { ok: true, response: body };
  } catch (err) {
    console.error('[meta-capi] Erreur fetch:', err && err.message);
    return { ok: false, error: err && err.message };
  }
}
