import { LegalLayout } from '@/components/legal/legal-layout'
import { CONTACT_ABUSE, LEGAL_UPDATED } from '@/lib/legal-meta'

export function AupPage() {
  return (
    <LegalLayout title="Acceptable Use Policy" updated={LEGAL_UPDATED}>
      <h2>1. Scope</h2>
      <p>
        This Acceptable Use Policy (“AUP”) applies to everything you run on or through the Service,
        and forms part of our <a href="/legal/terms">Terms of Service</a>. It exists to keep the
        platform safe and usable for everyone on it.
      </p>
      <p>
        You are responsible for your servers and for anyone you give access to them. If a customer
        of yours violates this policy, that is your violation.
      </p>

      <h2>2. Prohibited content</h2>
      <p>You may not store, transmit or link to:</p>
      <ul>
        <li>content that sexualises minors in any form;</li>
        <li>content that incites violence, terrorism or hatred against a person or group;</li>
        <li>content that infringes copyright, trademark or other intellectual property rights;</li>
        <li>material you do not have the legal right to possess or distribute;</li>
        <li>malware, ransomware, botnet command infrastructure or exploit kits;</li>
        <li>
          stolen credentials, stolen personal data, or databases of unlawfully obtained personal
          information;
        </li>
        <li>content that violates applicable export control or sanctions law.</li>
      </ul>

      <h2>3. Prohibited activities</h2>
      <p>You may not:</p>
      <ul>
        <li>send spam or unsolicited bulk email, or operate open mail relays;</li>
        <li>
          conduct port scanning, vulnerability scanning or penetration testing against systems you
          do not own or have written permission to test;
        </li>
        <li>launch denial-of-service attacks, or operate stress-testing tools against third parties;</li>
        <li>
          attempt to access, probe or interfere with our infrastructure, other customers’ servers,
          or the panel outside its published interfaces;
        </li>
        <li>evade or attempt to evade resource limits, quotas or billing;</li>
        <li>use the Service to commit fraud, launder money, or violate any law;</li>
        <li>resell or sublease the Service without our written agreement.</li>
      </ul>

      <h2>4. Resource use</h2>
      <p>Plans carry CPU, memory, storage, network and bandwidth limits. You may not:</p>
      <ul>
        <li>run workloads designed to consume substantially more than your plan provides;</li>
        <li>
          use storage as a general-purpose file host, backup target or media distribution service
          unrelated to your servers;
        </li>
        <li>generate traffic intended to exhaust shared network capacity;</li>
        <li>run nested virtualisation or container workloads that bypass plan limits.</li>
      </ul>
      <p>
        Sustained abuse degrades the platform for other customers. We may throttle, suspend or
        require a plan change.
      </p>

      <h2>5. Cryptocurrency mining</h2>
      <p>
        Cryptocurrency mining is not permitted on the Service, on any plan. It consumes shared
        resources disproportionately and is a persistent source of abuse. Accounts found mining will
        be suspended.
      </p>

      <h2>6. Email and messaging</h2>
      <p>If you send email from the Service:</p>
      <ul>
        <li>
          you must have consent consistent with applicable law, including the GDPR where it applies
          and the CAN-SPAM Act in the United States;
        </li>
        <li>you must honour unsubscribe requests promptly;</li>
        <li>you must not send from IP addresses that are not allocated to you;</li>
        <li>
          bulk sending requires prior written approval, so that we can manage sender reputation and
          blocklists.
        </li>
      </ul>
      <p>
        We may block outbound port 25 by default and may restrict other mail ports to protect
        network reputation.
      </p>

      <h2>7. Security testing</h2>
      <p>
        We support legitimate security research. Active testing against the Service itself requires
        written authorisation from us in advance. Testing against third parties requires their
        written authorisation. Without it, it is a policy violation and may be a criminal offence.
      </p>

      <h2>8. Copyright complaints</h2>
      <p>
        If you believe content hosted on the Service infringes your rights, contact{' '}
        <a href={`mailto:${CONTACT_ABUSE}`}>{CONTACT_ABUSE}</a> with the details required by the
        applicable notice-and-takedown law, including identification of the work, the location of
        the material, your contact details, and a statement of good-faith belief.
      </p>
      <p>
        We may remove or disable access to material and notify the account holder. Repeat infringers
        will have their accounts terminated.
      </p>

      <h2>9. Adult content</h2>
      <p>
        Lawful adult content is permitted where it does not fall under section 2. You are
        responsible for age verification and for complying with the laws of every jurisdiction you
        serve. Content that sexualises minors is prohibited without exception and will be reported
        to law enforcement.
      </p>

      <h2>10. Enforcement</h2>
      <p>When we find a violation we may, depending on severity and repetition:</p>
      <ol>
        <li>contact you and request remediation within a stated period;</li>
        <li>throttle or restrict the affected server;</li>
        <li>suspend the affected server;</li>
        <li>suspend or terminate your account.</li>
      </ol>
      <p>
        We may act without prior notice where a violation creates an immediate risk to people, to
        other customers or to the platform, or where we are legally required to act.
      </p>

      <h2>11. Reporting abuse</h2>
      <p>
        Report abuse to <a href={`mailto:${CONTACT_ABUSE}`}>{CONTACT_ABUSE}</a>. Include the IP
        address or hostname, timestamps with timezone, and any evidence such as log excerpts or
        email headers. We investigate reports and keep reporters confidential where the law allows.
      </p>

      <h2>12. Appeals</h2>
      <p>
        If you believe we acted in error, reply to the enforcement notice within 14 days. A person
        not involved in the original decision will review it. We will tell you the outcome and our
        reasoning.
      </p>
    </LegalLayout>
  )
}
