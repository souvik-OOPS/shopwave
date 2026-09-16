import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * The four pages the footer's Company column links to.
 *
 * They are deliberately plain and truthful: ShopWave is a portfolio commerce platform,
 * not a trading company, so these pages describe the project rather than inventing a
 * registered business, a support desk or job openings that do not exist. Pointing every
 * one of these links at the catalogue instead — which is what they used to do — tells a
 * visitor looking for a privacy policy nothing at all.
 */
function CompanyPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="container-page py-12">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-heading-lg text-ink-900">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-600">{intro}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-600">{children}</div>
      </article>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink-900">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function AboutPage() {
  return (
    <CompanyPage
      title="About us"
      intro="ShopWave is a demonstration storefront — a complete commerce platform built to be read as much as used."
    >
      <Section heading="What this is">
        <p>
          Every screen here runs against a real API: a catalogue with variants and stock, a cart
          that reprices itself from the database on every read, server-side checkout totals, and
          payment state derived only from verified gateway signatures.
        </p>
        <p>
          The products, prices and reviews are sample data. Nothing ordered here is dispatched,
          and no payment is taken.
        </p>
      </Section>

      <Section heading="How it is built">
        <p>
          A React and TypeScript frontend over an Express and PostgreSQL API, with money handled
          in decimals rather than floats and stock changes applied as conditional updates so two
          buyers cannot take the same last unit.
        </p>
      </Section>

      <p>
        <Link to="/products" className="font-medium text-brand-700 hover:underline">
          Browse the catalogue →
        </Link>
      </p>
    </CompanyPage>
  );
}

export function ContactPage() {
  return (
    <CompanyPage
      title="Contact"
      intro="There is no staffed support desk behind this storefront, so here is what each channel would be — and what to do instead."
    >
      <Section heading="Order questions">
        <p>
          Your order history, delivery status and cancellation are all self-service. Open{' '}
          <Link to="/orders" className="font-medium text-brand-700 hover:underline">
            My orders
          </Link>{' '}
          to see every status change recorded against an order, including who made it and when.
        </p>
      </Section>

      <Section heading="Account and sign-in">
        <p>
          Password resets and email verification are sent by the application itself. If a link has
          expired, request a new one from the{' '}
          <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">
            password reset
          </Link>{' '}
          page — tokens are single-use by design.
        </p>
      </Section>

      <Section heading="Reporting a problem with the software">
        <p>
          This is a portfolio project. Issues belong with whoever deployed this instance; there is
          no public support address to write to, and this page will not pretend otherwise.
        </p>
      </Section>
    </CompanyPage>
  );
}

export function CareersPage() {
  return (
    <CompanyPage
      title="Careers"
      intro="ShopWave is not a company and is not hiring — this page exists so the link in the footer tells you that plainly."
    >
      <Section heading="No open roles">
        <p>
          There are no vacancies, no application form and no recruiter to forward a CV to. Any page
          claiming otherwise under this name is not connected to this project.
        </p>
      </Section>

      <Section heading="If you are evaluating the code">
        <p>
          The interesting parts are the ones that have to be right under concurrency: checkout
          reserving stock inside a transaction, cancellation returning it exactly once, and payment
          events that arrive late or twice being made harmless.
        </p>
      </Section>
    </CompanyPage>
  );
}

export function PrivacyPage() {
  return (
    <CompanyPage
      title="Privacy"
      intro="What this demonstration storefront stores about an account, and why each piece of it exists."
    >
      <Section heading="What is stored">
        <p>
          The name and email address given at registration; a bcrypt hash of the password, never
          the password itself; delivery addresses you save; your cart, wishlist and orders; and any
          reviews you submit.
        </p>
        <p>
          Signing in with Google stores the Google account id and email so the same person can sign
          in again. No Google credentials reach this application.
        </p>
      </Section>

      <Section heading="Payments">
        <p>
          Card details are never sent to or stored by this application. Payments are handled by the
          gateway, and only the gateway&apos;s own order and payment identifiers, the amount and the
          verified status are kept — enough to reconcile an order and issue a refund.
        </p>
      </Section>

      <Section heading="Cookies">
        <p>
          Session cookies are HTTP-only, which is why no script on the page can read them. They
          carry sign-in state and nothing else; there is no advertising or third-party tracking on
          this site.
        </p>
      </Section>

      <Section heading="Deleting your data">
        <p>
          Deactivating your account from{' '}
          <Link to="/profile" className="font-medium text-brand-700 hover:underline">
            your profile
          </Link>{' '}
          ends your sessions immediately. Past orders are retained in an anonymised form, because an
          order&apos;s record of what was sold at what price has to survive the account that placed it.
        </p>
        <p>
          This is sample data in a portfolio project — do not enter personal information here that
          you would not want to lose or expose.
        </p>
      </Section>
    </CompanyPage>
  );
}
