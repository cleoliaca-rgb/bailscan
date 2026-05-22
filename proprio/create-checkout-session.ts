// supabase/functions/create-checkout-session/index.ts
//
// Edge Function Supabase pour créer une session de checkout Stripe
// (abonnement Essentiel/Premium ou bail one-shot)
//
// Déploiement :
//   supabase functions deploy create-checkout-session
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_XXX

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Vérification de l'auth
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { price_id } = await req.json();

    // Récupérer ou créer le Stripe Customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Détermine si c'est un abonnement ou un paiement one-shot
    const price = await stripe.prices.retrieve(price_id);
    const mode = price.recurring ? 'subscription' : 'payment';

    // Crée la session de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode,
      payment_method_types: ['card', 'sepa_debit'],
      line_items: [{ price: price_id, quantity: 1 }],
      // Pour les abonnements, autoriser Apple/Google Pay
      ...(mode === 'subscription' && {
        payment_method_collection: 'always',
        subscription_data: {
          metadata: { user_id: user.id },
        },
      }),
      // URLs de redirection
      success_url: `${Deno.env.get('APP_URL')}/abonnement.html?paiement=success`,
      cancel_url: `${Deno.env.get('APP_URL')}/abonnement.html?paiement=cancel`,
      locale: 'fr',
      allow_promotion_codes: true,
      metadata: { user_id: user.id, price_id },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
