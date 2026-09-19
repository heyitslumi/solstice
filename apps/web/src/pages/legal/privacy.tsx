import { LegalLayout } from '@/components/legal/legal-layout'
import {
  CONTACT_ABUSE,
  CONTACT_LEGAL,
  CONTACT_PRIVACY,
  LEGAL_ENTITY,
  LEGAL_UPDATED,
} from '@/lib/legal-meta'

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated={LEGAL_UPDATED}>
      <h2>1. Scope</h2>
      <p>
        This policy explains how <strong>{LEGAL_ENTITY}</strong> (“Solstice Host”, “we”) handles
        personal data when you use the Service, visit our website, or contact us.
      </p>

      <h2>2. Who is responsible</h2>
      <p>
        We are the data controller for account, billing and website data. For data you store on your
        servers, you are the controller and we act as your processor — we handle it only on your
        instructions and only as needed to run the Service.
      </p>

      <h2>3. What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — name, email address and API tokens.
        </li>
        <li>
          <strong>Billing data</strong> — billing contact, address, tax identifiers, invoices and
          payment history. Card details are handled by our payment processor; we do not store full
          card numbers.
        </li>
        <li>
          <strong>Service data</strong> — the servers, plans, IP allocations, snapshots and
          configuration associated with your account.
        </li>
        <li>
          <strong>Technical data</strong> — IP addresses, request logs, session and authentication
          events, and audit records of actions taken in the panel.
        </li>
        <li>
          <strong>Support data</strong> — the contents of your support requests and our
          correspondence with you.
        </li>
        <li>
          <strong>Usage data</strong> — CPU, memory, storage and bandwidth consumption, used for
          metering, capacity planning and billing.
        </li>
      </ul>
      <p>
        We do not collect the contents of your servers’ filesystems or the traffic passing through
        them, except where necessary to investigate a specific abuse report or where we are legally
        compelled.
      </p>

      <h2>4. How we use it</h2>
      <ul>
        <li>to create and administer your account;</li>
        <li>to provision, operate and support your servers;</li>
        <li>to calculate usage and bill you;</li>
        <li>to secure the platform, detect abuse and investigate incidents;</li>
        <li>
          to send service messages — outages, security notices and material changes to our terms;
        </li>
        <li>
          to send marketing where you have opted in, or where we have a legitimate interest and you
          have not objected;
        </li>
        <li>to meet our legal, tax and accounting obligations.</li>
      </ul>

      <h2>5. Legal bases</h2>
      <p>Where the GDPR applies, we rely on:</p>
      <ul>
        <li>
          <strong>Contract</strong> — to provide the Service you signed up for.
        </li>
        <li>
          <strong>Legal obligation</strong> — for tax, accounting and lawful requests from
          authorities.
        </li>
        <li>
          <strong>Legitimate interests</strong> — to secure the platform, prevent abuse and improve
          the Service. We balance these against your rights.
        </li>
        <li>
          <strong>Consent</strong> — for optional marketing and non-essential cookies. You can
          withdraw consent at any time.
        </li>
      </ul>

      <h2>6. Cookies and similar technologies</h2>
      <p>
        We use strictly necessary cookies for authentication and session management. These are
        required for the panel to function. Any analytics or preference cookies are optional and
        controlled by your consent, which you can change at any time.
      </p>

      <h2>7. Sharing and sub-processors</h2>
      <p>We share personal data only where necessary:</p>
      <ul>
        <li>
          <strong>Infrastructure providers</strong> — datacentre and network operators hosting your
          servers.
        </li>
        <li>
          <strong>Payment processors</strong> — to charge you and manage subscriptions.
        </li>
        <li>
          <strong>Email and support tooling</strong> — to send service messages and handle requests.
        </li>
        <li>
          <strong>Professional advisers</strong> — legal, accounting and audit, under
          confidentiality.
        </li>
        <li>
          <strong>Authorities</strong> — where we are legally required to disclose.
        </li>
      </ul>
      <p>
        We do not sell personal data. A current list of sub-processors is available on request at{' '}
        <a href={`mailto:${CONTACT_PRIVACY}`}>{CONTACT_PRIVACY}</a>.
      </p>

      <h2>8. International transfers</h2>
      <p>
        Your data may be processed outside the country you are in. Where we transfer personal data
        out of the European Economic Area we rely on an adequacy decision, or on appropriate
        safeguards such as the European Commission’s Standard Contractual Clauses.
      </p>

      <h2>9. Retention</h2>
      <ul>
        <li>
          <strong>Account data</strong> — for as long as your account is open, then for the period
          needed to meet legal and accounting obligations.
        </li>
        <li>
          <strong>Billing records</strong> — typically seven years, as required by tax law.
        </li>
        <li>
          <strong>Technical and audit logs</strong> — a limited period, generally 90 days, unless
          needed for a specific investigation.
        </li>
        <li>
          <strong>Server data</strong> — deleted after the recovery window following termination,
          described in the panel.
        </li>
      </ul>
      <p>Where data is no longer needed, we delete or anonymise it.</p>

      <h2>10. Security</h2>
      <p>
        We protect personal data with encryption in transit, emailed sign-in codes and passkeys for
        access, access controls and audit logging. No system is perfectly secure. We cannot
        guarantee absolute security, but where the law requires it we will notify you and the
        relevant authority of a breach affecting your data.
      </p>

      <h2>11. Your rights</h2>
      <p>Depending on where you live, you may have the right to:</p>
      <ul>
        <li>access the personal data we hold about you;</li>
        <li>correct inaccurate data;</li>
        <li>erase data, where no legal obligation requires us to keep it;</li>
        <li>restrict or object to processing;</li>
        <li>receive your data in a portable format;</li>
        <li>withdraw consent for consent-based processing;</li>
        <li>lodge a complaint with your supervisory authority.</li>
      </ul>
      <p>
        Contact <a href={`mailto:${CONTACT_PRIVACY}`}>{CONTACT_PRIVACY}</a> to exercise any of
        these. We respond within the period required by law, generally 30 days.
      </p>

      <h2>12. Children</h2>
      <p>
        The Service is not intended for anyone under 18. We do not knowingly collect personal data
        from children.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update this policy. Material changes will be announced in the panel or by email
        before they take effect.
      </p>

      <h2>14. Contact</h2>
      <ul>
        <li>
          Privacy questions and requests:{' '}
          <a href={`mailto:${CONTACT_PRIVACY}`}>{CONTACT_PRIVACY}</a>
        </li>
        <li>
          Abuse reports: <a href={`mailto:${CONTACT_ABUSE}`}>{CONTACT_ABUSE}</a>
        </li>
        <li>
          Legal notices: <a href={`mailto:${CONTACT_LEGAL}`}>{CONTACT_LEGAL}</a>
        </li>
      </ul>
    </LegalLayout>
  )
}
