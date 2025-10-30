// app/marketing/page.tsx
import Link from 'next/link';
import '.styles/globals.css';

export const metadata = {
  title: 'Anchored Family — Strong Families. Steady Rhythms.',
  description: 'The all-in-one family platform for planning, devotions, budgeting, and more.',
};

export default function MarketingPage() {
  return (
    <main className="af-wrap">
      {/* Top row */}
      <section className="af-top">
        {/* Left: Title + CTA */}
        <div className="af-card af-left">
          <div className="af-left-inner">
            <h1 className="af-brand">Anchored Family</h1>
            <p className="af-tagline">Strong families. Steady rhythms. One simple home base.</p>

            <div className="af-cta">
              <Link href="/login" className="af-btn af-btn-outline">Log In</Link>
              <Link href="/signup" className="af-btn af-btn-outline af-btn-primary">Create Account</Link>
            </div>
          </div>
        </div>

        {/* Right: Video */}
        <div className="af-card af-right">
          <div className="af-video-wrap">
            {/* Update the src to your actual file in /public/images */}
            <video
              className="af-video"
              src="/images/anchored-teaser.mp4"
              poster="/images/anchored-teaser-poster.jpg"
              controls
              playsInline
            />
            <div className="af-video-caption">See Anchored Family in action</div>
          </div>
        </div>
      </section>

      {/* Bottom row: Plans */}
      <section className="af-card af-bottom">
        <div className="af-bottom-inner">
          <h2 className="af-section-title">Choose Your Plan</h2>
          <div className="af-plans">
            <div className="af-plan">
              <div className="af-plan-name">Free</div>
              <ul className="af-plan-list">
                <li>Core family planner</li>
                <li>Basic devotions (KJV)</li>
                <li>Shared calendar</li>
              </ul>
            </div>

            <div className="af-plan">
              <div className="af-plan-name">Plus</div>
              <ul className="af-plan-list">
                <li>Everything in Free</li>
                <li>Advanced budgeting tools</li>
                <li>Enhanced sharing & roles</li>
                <li>Priority support</li>
              </ul>
            </div>

            <div className="af-plan">
              <div className="af-plan-name">Premium</div>
              <ul className="af-plan-list">
                <li>Everything in Plus</li>
                <li>Deep study devotion add-ons</li>
                <li>Family archives & vault</li>
                <li>Early access to new features</li>
              </ul>
            </div>
          </div>

          <div className="af-bottom-cta">
            <Link href="/signup" className="af-btn af-btn-outline af-btn-primary">Start Your Free Trial</Link>
          </div>
        </div>
      </section>
    </main>
  );
}


