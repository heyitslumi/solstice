import { LegalLayout } from '@/components/legal/legal-layout'
import {
  CONTACT_ABUSE,
  CONTACT_LEGAL,
  LEGAL_ADDRESS,
  LEGAL_ENTITY,
  LEGAL_JURISDICTION,
  LEGAL_UPDATED,
} from '@/lib/legal-meta'

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated={LEGAL_UPDATED}>
      <h2>1. About this agreement</h2>
      <p>
        These Terms of Service (“Terms”) govern your access to and use of this control
        panel, virtual servers, and related services (together, the “Service”). The Service is
        operated by <strong>{LEGAL_ENTITY}</strong>, {LEGAL_ADDRESS} (“we”, “us”).
      </p>
      <p>
        By creating an account or using the Service you agree to these Terms and to our{' '}
        <a href="/legal/aup">Acceptable Use Policy</a>. If you are entering into these Terms on
        behalf of an organisation, you confirm that you have authority to bind that organisation,
        and “you” refers to that organisation.
      </p>
      <p>If you do not agree to these Terms, do not use the Service.</p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old, or the age of majority in your jurisdiction, to use the
        Service. You must provide accurate, current and complete registration information and keep
        it up to date.
      </p>

      <h2>3. Your account</h2>
      <ul>
        <li>
          You are responsible for keeping your credentials and any API tokens issued to your account
          confidential.
        </li>
        <li>
          You are responsible for all activity that occurs under your account, whether or not you
          authorised it.
        </li>
        <li>
          Enable two-factor authentication where it is available. We strongly recommend it for any
          account with billing or administrative access.
        </li>
        <li>
          Tell us promptly at <a href={`mailto:${CONTACT_LEGAL}`}>{CONTACT_LEGAL}</a> if you believe
          your account has been compromised.
        </li>
        <li>
          We may suspend an account we reasonably believe is compromised, in order to protect you
          and other customers.
        </li>
      </ul>

      <h2>4. The Service</h2>
      <ul>
        <li>
          We provide virtual private servers, storage, snapshots, backups and networking running on
          infrastructure we operate.
        </li>
        <li>
          Resources are provisioned as described in the plan you select. CPU, memory, storage and
          bandwidth allowances are stated at the point of order.
        </li>
        <li>
          We may modify, deprecate or discontinue individual features. Where a change materially
          reduces what you have paid for, we will give reasonable advance notice.
        </li>
        <li>
          The Service depends on third-party networks, hardware and software that we do not control.
          We do not warrant that it will be uninterrupted or error-free.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>
        Your use of the Service must comply with our <a href="/legal/aup">Acceptable Use Policy</a>,
        which forms part of these Terms. You are responsible for everything running on your servers,
        including content uploaded by your own customers or users.
      </p>

      <h2>6. Fees, billing and taxes</h2>
      <ul>
        <li>
          Fees are set out at the point of order and are payable in advance for the billing period
          you select.
        </li>
        <li>
          Fees are exclusive of taxes. You are responsible for any value-added, sales or similar
          taxes, other than taxes on our own income.
        </li>
        <li>
          If a payment fails we may suspend the Service after notice. We do not delete your data
          immediately on suspension — see section 8.
        </li>
        <li>
          We may change prices with at least 30 days’ notice. Changes apply from your next renewal
          and are not applied retroactively.
        </li>
        <li>
          Except where required by law or expressly stated otherwise, fees are non-refundable.
        </li>
      </ul>

      <h2>7. Service levels and support</h2>
      <ul>
        <li>
          We target the availability described in your plan. Availability targets are goals rather
          than guarantees unless a separate written service level agreement applies.
        </li>
        <li>
          Support is provided through the channels published in the panel. We aim to respond within
          the times stated there.
        </li>
        <li>Scheduled maintenance is announced in advance where practicable.</li>
      </ul>

      <h2>8. Suspension and termination</h2>
      <p>We may suspend or terminate the Service if:</p>
      <ul>
        <li>you materially breach these Terms or the Acceptable Use Policy;</li>
        <li>
          your use poses a security risk to us, to our infrastructure, or to other customers;
        </li>
        <li>payment remains outstanding after notice;</li>
        <li>we are required to do so by law.</li>
      </ul>
      <p>
        Where a breach can be remedied, we will normally give you notice and a reasonable
        opportunity to fix it before suspending. We may act immediately where the risk is serious or
        ongoing.
      </p>
      <p>
        You may cancel at any time from the panel. Cancellation stops future renewals; it does not
        entitle you to a refund for the current period.
      </p>
      <p>
        On termination we delete your servers and their data after a short recovery window, which we
        publish in the panel. Export anything you need before then.
      </p>

      <h2>9. Your content and data</h2>
      <ul>
        <li>You retain all rights to the content and data you place on the Service.</li>
        <li>
          You grant us the licence we need to host, transmit, back up and display that content,
          solely to operate the Service.
        </li>
        <li>
          You are responsible for having the right to store and process the data you put on the
          Service, including personal data belonging to third parties.
        </li>
        <li>
          You are responsible for your own backups of anything you cannot afford to lose. Our
          snapshot and backup features are conveniences, not a substitute for your own backup
          strategy.
        </li>
      </ul>

      <h2>10. Our intellectual property</h2>
      <p>
        The Service, the panel, our software, branding and documentation remain our property or that
        of our licensors. These Terms do not transfer ownership of any of it to you. You may not
        copy, resell or reverse engineer the Service except as permitted by law.
      </p>

      <h2>11. Open-source components</h2>
      <p>
        Parts of the Service are built on open-source software, including Incus and other
        components, each governed by its own licence. Nothing in these Terms restricts rights you
        have under those licences.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        The Service is provided “as is” and “as available”. To the maximum extent permitted by law,
        we disclaim all implied warranties, including merchantability, fitness for a particular
        purpose and non-infringement. We do not warrant that the Service will meet your requirements
        or that data will not be lost.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>To the maximum extent permitted by law:</p>
      <ul>
        <li>
          we are not liable for indirect, incidental, special, consequential or punitive damages, or
          for lost profits, revenue, goodwill or data;
        </li>
        <li>
          our total aggregate liability arising out of or relating to the Service is limited to the
          fees you paid us in the 12 months preceding the event giving rise to the claim.
        </li>
      </ul>
      <p>
        Nothing in these Terms excludes liability that cannot lawfully be excluded, including
        liability for death or personal injury caused by negligence, or for fraud.
      </p>

      <h2>14. Indemnity</h2>
      <p>
        You agree to indemnify and hold us harmless against claims, losses and costs (including
        reasonable legal fees) arising from your use of the Service, your content, or your breach of
        these Terms or the Acceptable Use Policy.
      </p>

      <h2>15. Changes to these Terms</h2>
      <p>
        We may update these Terms. If a change is material we will give notice in the panel or by
        email before it takes effect. Continuing to use the Service after the effective date means
        you accept the updated Terms.
      </p>

      <h2>16. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of <strong>{LEGAL_JURISDICTION}</strong>, without regard
        to conflict-of-law rules. The courts of {LEGAL_JURISDICTION} have exclusive jurisdiction,
        except that either party may seek injunctive relief in any competent court to protect its
        intellectual property or infrastructure.
      </p>

      <h2>17. Contact</h2>
      <p>
        Questions about these Terms:{' '}
        <a href={`mailto:${CONTACT_LEGAL}`}>{CONTACT_LEGAL}</a>
      </p>
      <p>
        Abuse reports: <a href={`mailto:${CONTACT_ABUSE}`}>{CONTACT_ABUSE}</a>
      </p>
    </LegalLayout>
  )
}
