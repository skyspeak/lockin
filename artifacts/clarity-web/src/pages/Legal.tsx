interface LegalPageProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1715]">
      <div className="mx-auto max-w-xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#c8553d] mb-2">Clarity</p>
        <h1 className="text-3xl font-bold tracking-tight font-serif mb-2">{title}</h1>
        <p className="text-sm text-[#7a716b] mb-8">Last updated {updated}</p>
        <div className="space-y-4 text-sm leading-relaxed text-[#1a1715]">{children}</div>
        <p className="mt-10 text-sm">
          <a href="/" className="font-semibold text-[#c8553d] hover:underline">
            Back to Clarity
          </a>
        </p>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 16, 2026">
      <p>
        Clarity is a voice-first task app. This policy explains what we collect, why, and how you can
        delete it. By creating an account you agree to this policy.
      </p>
      <h2 className="text-base font-semibold pt-2">What we collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Email address and a hashed password (we never store your password in plain text).</li>
        <li>Tasks, notes, and next steps you create in the app.</li>
        <li>
          Voice recordings you submit to capture or refine a task. Audio is sent to our servers only to
          transcribe speech and turn it into tasks. We do not keep the audio file after processing.
        </li>
        <li>Basic technical logs (for example request time and error codes) to keep the service reliable.</li>
      </ul>
      <h2 className="text-base font-semibold pt-2">How we use it</h2>
      <p>
        We use your data only to run Clarity: sign you in, store your tasks, and convert speech into
        action items. We do not sell your data. We do not use your voice or tasks to advertise to you.
      </p>
      <h2 className="text-base font-semibold pt-2">Processors</h2>
      <p>
        Speech-to-text and task extraction are performed by Google Gemini and, if needed, OpenRouter
        acting as our processors. They receive the audio or transcript for that request so we can return
        tasks to you.
      </p>
      <h2 className="text-base font-semibold pt-2">Your choices</h2>
      <p>
        You can log out at any time. You can delete your account in Settings (iPhone) or from the account
        bar (web). Deleting your account permanently removes your email, password hash, thoughts, and
        tasks.
      </p>
      <h2 className="text-base font-semibold pt-2">Children</h2>
      <p>Clarity is not directed at children under 13, and we do not knowingly collect their data.</p>
      <h2 className="text-base font-semibold pt-2">Contact</h2>
      <p>
        For privacy questions or to request deletion if you cannot use the in-app control, contact the
        developer through the App Store listing or the support email published with the app.
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="August 16, 2026">
      <p>
        Clarity helps you capture thoughts by voice and turn them into tasks. The service is provided as
        is. Please use it for your own personal organization.
      </p>
      <h2 className="text-base font-semibold pt-2">Your account</h2>
      <p>
        You are responsible for your password and for what you record. Do not capture other people’s
        private conversations without permission. You must be 13 or older.
      </p>
      <h2 className="text-base font-semibold pt-2">The service</h2>
      <p>
        Task extraction is automated and can be wrong. Review what Clarity creates before you act on it.
        We may change or discontinue features. We may suspend accounts that abuse the API or other users.
      </p>
      <h2 className="text-base font-semibold pt-2">Limitation of liability</h2>
      <p>
        To the fullest extent allowed by law, Skyspeak and Clarity are not liable for missed tasks, model
        mistakes, downtime, or any damages that come from using the app.
      </p>
      <h2 className="text-base font-semibold pt-2">Termination</h2>
      <p>You can delete your account at any time. We may delete accounts that violate these terms.</p>
    </LegalPage>
  );
}
