/**
 * bailscan-auth.js — Système central d'authentification et feature gating
 *
 * À inclure dans toutes les pages du dashboard :
 *   <script src="bailscan-auth.js"></script>
 *
 * Dépendances :
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://VOTRE_PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_CLEF_ANON';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_XXX';
const STRIPE_PRICES = {
  essentiel_monthly: 'price_XXX',
  essentiel_yearly: 'price_XXX',
  premium_monthly: 'price_XXX',
  premium_yearly: 'price_XXX',
  bail_oneshot: 'price_XXX'
};

// ═══════════════════════════════════════════════════════════════
// MATRICE DE PERMISSIONS — Single source of truth
// ═══════════════════════════════════════════════════════════════

const PLAN_LIMITS = {
  gratuit: {
    biens_max: 1,
    bail_unitaire: 19.00,
    analyses_bail_par_mois: 2,
    analyses_dossier_par_mois: 2,
    courriers_ia_par_mois: 2,
    questions_juridique_ia_par_mois: 5,
    prelevement_cout: 2.90,
    quittances_auto: false,
    suivi_loyers_auto: false,
    alertes_irl: false,
    fiscalite_pre_remplie: false,
    edl_digital: false,
    veille_juridique: false,
    coffre_go: 5,
    remise_partenaires: 0
  },
  essentiel: {
    biens_max: Infinity,
    bail_unitaire: 9.90,
    analyses_bail_par_mois: Infinity,
    analyses_dossier_par_mois: Infinity,
    courriers_ia_par_mois: Infinity,
    questions_juridique_ia_par_mois: 10,
    prelevement_cout: 0.90,
    quittances_auto: true,
    suivi_loyers_auto: true,
    alertes_irl: true,
    fiscalite_pre_remplie: false,
    edl_digital: false,
    veille_juridique: false,
    coffre_go: 20,
    remise_partenaires: 5
  },
  premium: {
    biens_max: Infinity,
    bail_unitaire: 0,
    analyses_bail_par_mois: Infinity,
    analyses_dossier_par_mois: Infinity,
    courriers_ia_par_mois: Infinity,
    questions_juridique_ia_par_mois: Infinity,
    prelevement_cout: 0,
    quittances_auto: true,
    suivi_loyers_auto: true,
    alertes_irl: true,
    fiscalite_pre_remplie: true,
    edl_digital: true,
    veille_juridique: true,
    coffre_go: 100,
    remise_partenaires: 10
  }
};

// Pages publiques (pas besoin d'auth)
const PUBLIC_PAGES = ['connexion.html', 'inscription.html', 'mot-de-passe-oublie.html'];

// ═══════════════════════════════════════════════════════════════
// CLIENT SUPABASE
// ═══════════════════════════════════════════════════════════════

let supabaseClient = null;

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.warn('[BailScan] Supabase client non chargé. Ajoutez :\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ═══════════════════════════════════════════════════════════════
// SESSION ET PROFIL
// ═══════════════════════════════════════════════════════════════

const BailScan = {
  user: null,        // utilisateur Supabase auth.user
  profile: null,     // ligne profiles (plan, stripe_customer_id, …)
  usage: null,       // ligne usage_counters (mois en cours)
  ready: false,

  /**
   * Initialise la session, charge le profil et l'usage.
   * Redirige vers /connexion.html si l'utilisateur n'est pas connecté
   * sur une page protégée.
   */
  async init() {
    const sb = initSupabase();
    if (!sb) {
      this.ready = true;
      return;
    }

    const { data: { session } } = await sb.auth.getSession();
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
    const isPublic = PUBLIC_PAGES.includes(currentPage);

    if (!session) {
      if (!isPublic) {
        // Pas connecté sur page protégée → redirect
        window.location.href = 'connexion.html';
        return;
      }
      this.ready = true;
      return;
    }

    this.user = session.user;

    // Charge le profil
    const { data: profile, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', this.user.id)
      .single();

    if (error) {
      console.error('[BailScan] Erreur chargement profil:', error);
    } else {
      this.profile = profile;
    }

    // Charge les compteurs d'usage du mois en cours
    const currentMonth = new Date().toISOString().slice(0, 7); // ex. "2026-05"
    const { data: usage } = await sb
      .from('usage_counters')
      .select('*')
      .eq('user_id', this.user.id)
      .eq('month', currentMonth)
      .single();

    this.usage = usage || {
      analyses_bail: 0,
      analyses_dossier: 0,
      courriers_ia: 0,
      questions_juridique: 0
    };

    this.ready = true;
    this._injectUI();
  },

  /**
   * Plan courant de l'utilisateur ('gratuit', 'essentiel', 'premium')
   */
  plan() {
    return (this.profile && this.profile.plan) || 'gratuit';
  },

  /**
   * Limites du plan courant
   */
  limits() {
    return PLAN_LIMITS[this.plan()];
  },

  /**
   * Vérifie si l'utilisateur peut accéder à une feature.
   * @param {string} feature - clé dans PLAN_LIMITS
   * @returns {boolean|number} - true/false pour booléens, valeur restante pour quotas
   */
  can(feature) {
    const lim = this.limits();
    if (typeof lim[feature] === 'boolean') return lim[feature];
    if (lim[feature] === Infinity) return true;

    // Pour les quotas mensuels, vérifier l'usage
    const usageMap = {
      analyses_bail_par_mois: 'analyses_bail',
      analyses_dossier_par_mois: 'analyses_dossier',
      courriers_ia_par_mois: 'courriers_ia',
      questions_juridique_ia_par_mois: 'questions_juridique'
    };
    if (usageMap[feature]) {
      const used = (this.usage && this.usage[usageMap[feature]]) || 0;
      return used < lim[feature];
    }

    return lim[feature];
  },

  /**
   * Quota restant pour une feature à compteur mensuel
   */
  remaining(feature) {
    const lim = this.limits()[feature];
    if (lim === Infinity) return Infinity;
    const usageMap = {
      analyses_bail_par_mois: 'analyses_bail',
      analyses_dossier_par_mois: 'analyses_dossier',
      courriers_ia_par_mois: 'courriers_ia',
      questions_juridique_ia_par_mois: 'questions_juridique'
    };
    if (!usageMap[feature]) return null;
    const used = (this.usage && this.usage[usageMap[feature]]) || 0;
    return Math.max(0, lim - used);
  },

  /**
   * Incrémente un compteur d'usage côté DB.
   * À appeler après une utilisation réussie d'une feature.
   */
  async track(feature) {
    const sb = initSupabase();
    if (!sb || !this.user) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    await sb.rpc('increment_usage', {
      p_user_id: this.user.id,
      p_month: currentMonth,
      p_feature: feature
    });
    // Refresh local
    this.usage[feature] = (this.usage[feature] || 0) + 1;
  },

  /**
   * Déconnexion
   */
  async logout() {
    const sb = initSupabase();
    if (sb) await sb.auth.signOut();
    window.location.href = 'connexion.html';
  },

  /**
   * Ouvre le portail Stripe pour gérer l'abonnement
   * (nécessite une Edge Function Supabase 'create-portal-session')
   */
  async openBillingPortal() {
    const sb = initSupabase();
    if (!sb) return;
    const { data, error } = await sb.functions.invoke('create-portal-session');
    if (error) {
      alert('Erreur lors de l\'ouverture du portail de facturation.');
      return;
    }
    window.location.href = data.url;
  },

  /**
   * Initie un checkout Stripe pour un abonnement ou un bail one-shot
   */
  async checkout(priceKey) {
    const sb = initSupabase();
    if (!sb) return;
    const { data, error } = await sb.functions.invoke('create-checkout-session', {
      body: { price_id: STRIPE_PRICES[priceKey] }
    });
    if (error) {
      alert('Erreur lors de l\'ouverture du paiement.');
      return;
    }
    window.location.href = data.url;
  },

  // ─── UI INJECTION ────────────────────────────────────────────
  _injectUI() {
    // Met à jour le nom et le plan dans la sidebar
    document.querySelectorAll('.dash-user-name').forEach(el => {
      if (this.profile) {
        const fullname = `${this.profile.prenom || ''} ${this.profile.nom || ''}`.trim();
        el.textContent = fullname || this.user.email;
      }
    });
    document.querySelectorAll('.dash-user-plan').forEach(el => {
      const planLabels = { gratuit: 'Plan Gratuit', essentiel: 'Plan Essentiel', premium: 'Plan Premium' };
      el.textContent = planLabels[this.plan()];
    });

    // Cache le bouton "Passer à l'Essentiel" pour les abonnés payants
    if (this.plan() !== 'gratuit') {
      document.querySelectorAll('.btn-upgrade').forEach(el => el.style.display = 'none');
    }

    // Cache automatiquement les éléments avec data-requires="..." si le user n'a pas accès
    document.querySelectorAll('[data-requires]').forEach(el => {
      const feature = el.getAttribute('data-requires');
      if (!this.can(feature)) {
        el.classList.add('locked');
        // Ajoute un cadenas s'il n'y en a pas déjà
        if (!el.querySelector('.lock-icon')) {
          const lock = document.createElement('span');
          lock.className = 'lock-icon';
          lock.innerHTML = ' 🔒';
          el.appendChild(lock);
        }
      }
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// PAYWALL MODAL
// ═══════════════════════════════════════════════════════════════

const Paywall = {
  /**
   * Affiche le paywall pour une feature donnée.
   * @param {Object} opts
   *   - feature: nom human-readable ("Quittances automatiques")
   *   - requires: plan minimum requis ("essentiel" ou "premium")
   *   - description: texte court expliquant la valeur
   */
  show(opts) {
    const requires = opts.requires || 'essentiel';
    const planLabel = requires === 'premium' ? 'Premium' : 'Essentiel';
    const planPrice = requires === 'premium' ? '29,90 €' : '17,90 €';
    const planNetPrice = requires === 'premium' ? '~15 €' : '~9 €';

    // Construit la liste des bénéfices selon le plan
    const benefits = requires === 'premium' ? [
      'Baux illimités inclus',
      'Assistant juridique IA 24/7 illimité',
      'Prélèvement automatique illimité',
      'Déclaration fiscale 2042/2044 pré-remplie',
      'EDL digital app mobile',
      '−10 % sur GLI, PNO, dépannage'
    ] : [
      'Biens illimités',
      'Baux à 9,90 €/bail (au lieu de 19 €)',
      'Quittances automatiques mensuelles',
      'Suivi des loyers automatisé',
      'Alertes IRL et fin de bail',
      'Prélèvement auto 0,90 €/prélèvement'
    ];

    // Construit le HTML
    let html = `
      <div class="pw-overlay" id="pwOverlay" onclick="Paywall.close(event)">
        <div class="pw-modal" onclick="event.stopPropagation()">
          <button class="pw-close" onclick="Paywall.close()" aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          <div class="pw-hero">
            <div class="pw-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div class="pw-tag">Réservé au plan ${planLabel}</div>
            <h2 class="pw-title">${opts.feature || 'Cette fonctionnalité'}</h2>
            <p class="pw-desc">${opts.description || 'Débloquez cette fonctionnalité et toutes les autres avec le plan ' + planLabel + '.'}</p>
          </div>

          <div class="pw-benefits">
            <div class="pw-benefits-title">Inclus dans ${planLabel}</div>
            <ul>${benefits.map(b => `<li>${b}</li>`).join('')}</ul>
          </div>

          <div class="pw-price-row">
            <div>
              <div class="pw-price">${planPrice}<span>/mois</span></div>
              <div class="pw-price-sub">${planNetPrice} après déduction d'impôts*</div>
            </div>
            <button class="pw-cta" onclick="Paywall.upgrade('${requires}')">
              Passer à ${planLabel} →
            </button>
          </div>

          <div class="pw-footer">
            <a href="abonnement.html" onclick="Paywall.close()">Voir tous les plans et comparer</a> · Sans engagement, résiliation en 1 clic
          </div>
        </div>
      </div>
    `;

    // Injecte les styles si pas déjà fait
    if (!document.getElementById('pw-styles')) {
      const style = document.createElement('style');
      style.id = 'pw-styles';
      style.textContent = `
        .pw-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,.55);
          backdrop-filter: blur(4px); z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: pwFadeIn .2s;
        }
        @keyframes pwFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .pw-modal {
          background: white; border-radius: 18px; max-width: 480px; width: 100%;
          padding: 36px 32px 28px; box-shadow: 0 20px 50px rgba(0,0,0,.25);
          position: relative; animation: pwSlideUp .25s;
        }
        @keyframes pwSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .pw-close {
          position: absolute; top: 16px; right: 16px; background: none;
          border: none; color: var(--gris); cursor: pointer; padding: 6px;
          border-radius: 7px; transition: all .12s;
        }
        .pw-close:hover { background: var(--bg-main); color: var(--texte); }
        .pw-hero { text-align: center; margin-bottom: 22px; }
        .pw-icon {
          width: 52px; height: 52px; border-radius: 14px;
          background: linear-gradient(135deg, #0f172a 0%, #3b6fd4 100%);
          color: white; display: inline-flex; align-items: center;
          justify-content: center; margin-bottom: 14px;
        }
        .pw-tag {
          display: inline-block; background: var(--pro-light);
          color: var(--pro-accent); font-size: .65rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: .08em;
          padding: 4px 11px; border-radius: 18px; margin-bottom: 10px;
        }
        .pw-title {
          font-family: 'Instrument Serif', serif; font-size: 1.6rem;
          color: var(--texte); margin-bottom: 6px; line-height: 1.15;
        }
        .pw-desc {
          font-size: .88rem; color: var(--gris); line-height: 1.55;
          margin: 0 auto; max-width: 360px;
        }
        .pw-benefits {
          background: var(--bg-main); border-radius: 11px;
          padding: 16px 18px; margin-bottom: 18px;
        }
        .pw-benefits-title {
          font-size: .68rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .07em; color: var(--gris); margin-bottom: 10px;
        }
        .pw-benefits ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 7px; }
        .pw-benefits li {
          display: flex; align-items: flex-start; gap: 8px;
          font-size: .85rem; color: var(--texte); line-height: 1.45;
        }
        .pw-benefits li::before {
          content: '✓'; color: var(--vert); font-weight: 700;
          flex-shrink: 0;
        }
        .pw-price-row {
          display: flex; align-items: center; gap: 16px;
          padding-top: 18px; border-top: 1px solid var(--border);
          margin-bottom: 14px;
        }
        .pw-price {
          font-family: 'Instrument Serif', serif; font-size: 1.8rem;
          color: var(--texte); line-height: 1;
        }
        .pw-price span { font-size: .85rem; color: var(--gris); font-family: 'DM Sans', sans-serif; font-weight: 400; }
        .pw-price-sub { font-size: .72rem; color: var(--vert); font-weight: 600; margin-top: 4px; }
        .pw-cta {
          margin-left: auto; background: var(--pro-accent); color: white;
          border: none; padding: 13px 22px; border-radius: 11px;
          font-weight: 700; font-size: .88rem; cursor: pointer;
          font-family: inherit; transition: background .15s;
        }
        .pw-cta:hover { background: #2a5bbf; }
        .pw-footer {
          font-size: .73rem; color: var(--gris); text-align: center; line-height: 1.5;
        }
        .pw-footer a { color: var(--pro-accent); font-weight: 600; text-decoration: none; }
        .pw-footer a:hover { text-decoration: underline; }

        /* Locked elements */
        .locked { position: relative; opacity: .65; cursor: not-allowed !important; }
        .locked:hover { opacity: .8; }
        .lock-icon { font-size: .82em; opacity: .7; }
      `;
      document.head.appendChild(style);
    }

    // Inject modal
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
  },

  close(e) {
    if (e && e.target.id !== 'pwOverlay' && !e.target.closest('.pw-close')) {
      // Click was inside modal, not on overlay or close button
      return;
    }
    const overlay = document.getElementById('pwOverlay');
    if (overlay) overlay.remove();
  },

  /**
   * Initie le checkout Stripe vers le plan ciblé
   */
  upgrade(plan) {
    BailScan.checkout(plan + '_monthly');
  }
};

// ═══════════════════════════════════════════════════════════════
// HELPERS POUR LE FRONT
// ═══════════════════════════════════════════════════════════════

/**
 * Intercepte un clic sur une feature verrouillée et affiche le paywall.
 * Usage : <button onclick="requireFeature('quittances_auto', {feature: 'Quittances automatiques', requires: 'essentiel'})">
 */
function requireFeature(featureKey, paywallOpts) {
  if (BailScan.can(featureKey)) return true;
  Paywall.show(paywallOpts);
  return false;
}

// ═══════════════════════════════════════════════════════════════
// AUTO-INIT au chargement de la page
// ═══════════════════════════════════════════════════════════════

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => BailScan.init());
} else {
  BailScan.init();
}

// Expose globalement
window.BailScan = BailScan;
window.Paywall = Paywall;
window.requireFeature = requireFeature;
