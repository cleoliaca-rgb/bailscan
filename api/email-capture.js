import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, source, ville, loyer_base, bien_type, analysis_score, montant_recuperable } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  try {
    // 1. Stocker dans Supabase
    const { error: dbError } = await supabase.from('email_captures').insert({
      email: email.toLowerCase().trim(),
      source: source || 'paywall',
      ville: ville || null,
      loyer_base: loyer_base ? Number(loyer_base) : null,
      bien_type: bien_type || null,
      analysis_score: analysis_score ? Number(analysis_score) : null,
      montant_recuperable: montant_recuperable ? Number(montant_recuperable) : null,
    });

    if (dbError) console.error('Supabase insert error:', dbError);

    // 2. Ajouter à Resend Audiences (optionnel, pour automation email)
    if (process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID) {
      await fetch(`https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          unsubscribed: false,
        }),
      }).catch(err => console.error('Resend error:', err));
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email capture error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
