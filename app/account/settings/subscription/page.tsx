'use client';

import { useState, useEffect } from 'react';
import { SUBSCRIPTION_PLANS, formatPrice } from '@/lib/stripe';

export default function SubscriptionPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'BASIC' | 'PREMIUM' | null>(null);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    // Check if user was redirected from a canceled checkout
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('canceled') === 'true') {
      setCanceled(true);
    }
  }, []);

  const handleSubscribe = async (planKey: 'BASIC' | 'PREMIUM') => {
    setIsLoading(true);
    setSelectedPlan(planKey);

    try {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/create-checkout-session';

      const priceInput = document.createElement('input');
      priceInput.type = 'hidden';
      priceInput.name = 'price_id';
      priceInput.value = SUBSCRIPTION_PLANS[planKey].priceId;

      form.appendChild(priceInput);
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setIsLoading(false);
      setSelectedPlan(null);
    }
  };

  return (
    <div className="container">
      <h1 className="page-title">Current Plan and Billing</h1>

      {canceled && (
        <div className="card section" style={{ backgroundColor: '#fef3cd', borderColor: '#fecf47' }}>
          <div className="section-title" style={{ color: '#b45309' }}>Checkout Canceled</div>
          <div className="subtitle" style={{ color: '#92400e' }}>
            No worries! You can try again when you're ready.
          </div>
        </div>
      )}

      <section className="card section">
        <h2 className="section-title">Choose Your Plan</h2>
        <div className="subtitle" style={{ marginBottom: '1.5rem' }}>
          Select the perfect plan for your family's needs
        </div>

        <div className="categories">
          {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => (
            <div key={key} className="category-card" style={{ position: 'relative' }}>
              {key === 'PREMIUM' && (
                <div 
                  style={{ 
                    position: 'absolute', 
                    top: '-8px', 
                    right: '8px', 
                    backgroundColor: '#3b82f6', 
                    color: 'white', 
                    padding: '2px 8px', 
                    borderRadius: '12px', 
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}
                >
                  Popular
                </div>
              )}
              
              <div style={{ width: '100%' }}>
                <div className="section-title" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>⚡</span>
                  {plan.name}
                </div>
                
                <div style={{ marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                    {formatPrice(plan.price)}
                  </span>
                  <span className="subtitle">/{plan.interval}</span>
                </div>

                <div className="subtitle" style={{ marginBottom: '1rem', fontSize: '0.875rem', lineHeight: '1.4' }}>
                  {key === 'BASIC' 
                    ? "Essential family tools: meal planning, recipes, calendar, and shopping lists"
                    : "Complete family suite: all Basic features plus devotions, budget tracking, and priority support"
                  }
                </div>

                <button
                  onClick={() => handleSubscribe(key as 'BASIC' | 'PREMIUM')}
                  disabled={isLoading && selectedPlan === key}
                  className={`btn ${key === 'PREMIUM' ? 'accent-blue' : 'accent-violet'} btn--sm`}
                  style={{ width: '100%' }}
                >
                  {isLoading && selectedPlan === key ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <div style={{ 
                        width: '16px', 
                        height: '16px', 
                        border: '2px solid transparent', 
                        borderTop: '2px solid currentColor', 
                        borderRadius: '50%', 
                        animation: 'spin 1s linear infinite' 
                      }}></div>
                      Processing...
                    </span>
                  ) : (
                    `Select ${plan.name}`
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card section">
        <h2 className="section-title">Plan Details</h2>
        <div className="subcategories">
          <div className="btn btn--sm" style={{ justifyContent: 'space-between', pointerEvents: 'none' }}>
            <span><strong>Basic Plan</strong> - Essential Features</span>
            <span className="subtitle">{formatPrice(SUBSCRIPTION_PLANS.BASIC.price)}/month</span>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', padding: '0 1rem', marginBottom: '1rem' }}>
            • Meal planning tools • Recipe collection • Family calendar • Shopping lists
          </div>
          
          <div className="btn btn--sm" style={{ justifyContent: 'space-between', pointerEvents: 'none' }}>
            <span><strong>Premium Plan</strong> - Complete Family Suite</span>
            <span className="subtitle">{formatPrice(SUBSCRIPTION_PLANS.PREMIUM.price)}/month</span>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', padding: '0 1rem' }}>
            • All Basic features • Advanced meal planning • Unlimited recipes • Family devotions library • Budget tracking • Priority support
          </div>
        </div>
      </section>

      <section className="section">
        <div className="subtitle" style={{ textAlign: 'center' }}>
          Cancel anytime. No long-term contracts.
        </div>
      </section>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}