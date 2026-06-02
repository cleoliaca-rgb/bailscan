// api/contact.js — recoit le formulaire de contact et l'envoie par email via Resend.
// Variables d'environnement Vercel :
//   RESEND_API_KEY  (obligatoire) — deja utilisee par BailScan
//   CONTACT_TO      (optionnel)   — destinataire, defaut cleolia.ca@gmail.com
//   CONTACT_FROM    (optionnel)   — expediteur verifie Resend, defaut onboarding@resend.dev
const RESEND_API = "https://api.resend.com/emails";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Methode non autorisee." });
  }

  try {
    var body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    var name = (body.name || "").toString().trim();
    var email = (body.email || "").toString().trim();
    var message = (body.message || "").toString().trim();
    var honeypot = (body.company || "").toString().trim();

    // Anti-spam : si le champ piege est rempli, on fait semblant d'accepter.
    if (honeypot) return res.status(200).json({ ok: true });

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: "Merci de remplir tous les champs." });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "Adresse email invalide." });
    }
    if (name.length > 120 || email.length > 160 || message.length > 4000) {
      return res.status(400).json({ ok: false, error: "Message trop long." });
    }

    var apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[contact] RESEND_API_KEY manquante");
      return res.status(500).json({ ok: false, error: "Service d'envoi indisponible." });
    }

    var to = process.env.CONTACT_TO || "cleolia.ca@gmail.com";
    var from = process.env.CONTACT_FROM || "BailScan <onboarding@resend.dev>";

    var html =
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6">' +
      '<h2 style="color:#c84b2f;margin:0 0 12px">Nouveau message — BailScan</h2>' +
      '<p><strong>Nom :</strong> ' + esc(name) + '</p>' +
      '<p><strong>Email :</strong> ' + esc(email) + '</p>' +
      '<p><strong>Message :</strong></p>' +
      '<div style="white-space:pre-wrap;background:#f5f0e8;border:1px solid #d8d0c4;border-radius:10px;padding:14px">' + esc(message) + '</div>' +
      '</div>';

    var payload = {
      from: from,
      to: [to],
      reply_to: email,
      subject: "Contact BailScan — " + name,
      html: html,
      text: "Nom : " + name + "\nEmail : " + email + "\n\n" + message
    };

    var r = await fetch(RESEND_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      var detail = "";
      try { detail = await r.text(); } catch (e) {}
      console.error("[contact] Resend echec", r.status, detail.slice(0, 300));
      return res.status(502).json({ ok: false, error: "Envoi impossible pour le moment." });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[contact] erreur", e && e.message);
    return res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
};
