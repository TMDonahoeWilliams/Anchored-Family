// app/marketing/page.tsx
import Link from 'next/link';

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

      <style jsx>{`
        /* Layout shell */
        .af-wrap {
          --emerald-dark: #065f46;       /* border */
          --left-bg:     #ecfdf5;        /* emerald-50 */
          --right-bg:    #eff6ff;        /* sky-50 */
          --bottom-bg:   #fef3c7;        /* amber-100 */
          --ink:         #1a202c;
          --muted:       #475569;
          --btn-border:  rgba(0,0,0,.14);
          --btn-hover:   rgba(0,0,0,.05);

          max-width: 1100px;
          margin: 0 auto;
          padding: 1rem;
          color: var(--ink);
        }

        .af-top {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        @media (max-width: 900px) {
          .af-top {
            grid-template-columns: 1fr;
          }
        }

        /* Cards with green border */
        .af-card {
          border: 2px solid var(--emerald-dark);
          border-radius: 12px;
          box-shadow: 0 6px 18px rgba(0,0,0,.06);
          overflow: hidden;
        }

        .af-left    { background: var(--left-bg); }
        .af-right   { background: var(--right-bg); }
        .af-bottom  { background: var(--bottom-bg); }

        /* Left inner */
        .af-left-inner {
          padding: 1.2rem 1.2rem 1.4rem;
          display: flex;
          flex-direction: column;
          gap: .75rem;
          min-height: 280px;
          justify-content: center;
        }

        .af-brand {
          font-size: clamp(1.6rem, 3.2vw, 2.2rem);
          font-weight: 900;
          letter-spacing: .2px;
          margin: 0;
        }

        .af-tagline {
          margin: .25rem 0 .75rem;
          font-size: 1rem;
          color: var(--muted);
        }

        .af-cta {
          display: flex;
          gap: .75rem;
          flex-wrap: wrap;
        }

        /* Buttons: white background, block borders */
        .af-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: .7rem 1rem;
          border-radius: .65rem;
          text-decoration: none;
          font-weight: 800;
          letter-spacing: .2px;
          transition: transform .08s ease, box-shadow .2s ease, background .2s ease;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .af-btn-outline {
          background: #fff;
          color: var(--ink);
          border: 2px solid var(--btn-border);
          box-shadow: 0 1px 0 rgba(0,0,0,.04);
        }
        .af-btn-outline:hover {
          background: #fff;
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(0,0,0,.12);
        }
        .af-btn-primary {
          border-color: var(--emerald-dark);
        }

        /* Right: video block */
        .af-video-wrap {
          padding: .75rem;
          display: flex;
          flex-direction: column;
          gap: .5rem;
        }
        .af-video {
          width: 100%;
          height: auto;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,.08);
          background: #000;
        }
        .af-video-caption {
          font-size: .85rem;
          color: var(--muted);
          text-align: center;
          padding-bottom: .25rem;
        }

        /* Bottom: plans */
        .af-bottom-inner {
          padding: 1.2rem;
        }
        .af-section-title {
          margin: 0 0 .8rem;
          font-size: 1.25rem;
          font-weight: 800;
        }
        .af-plans {
          display: grid;
          grid-template-columns: repeat(3, minmax(0,1fr));
          gap: .75rem;
        }
        @media (max-width: 900px) {
          .af-plans { grid-template-columns: 1fr; }
        }
        .af-plan {
          background: #fff;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 10px;
          padding: .9rem;
          box-shadow: 0 1px 0 rgba(0,0,0,.04);
        }
        .af-plan-name {
          font-weight: 800;
          margin-bottom: .4rem;
        }
        .af-plan-list {
          margin: 0;
          padding-left: 1.1rem;
          color: var(--muted);
          line-height: 1.6;
          font-size: .95rem;
        }

        .af-bottom-cta {
          margin-top: 1rem;
          display: flex;
          justify-content: center;
        }
      `}</style>
    </main>
  );
}


