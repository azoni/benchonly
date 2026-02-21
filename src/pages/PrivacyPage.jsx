import usePageTitle from '../utils/usePageTitle'

export default function PrivacyPage() {
  usePageTitle('Privacy Policy')

  return (
    <div className="min-h-screen bg-iron-950 text-iron-200 px-6 py-12 max-w-2xl mx-auto">
      <h1 className="text-3xl font-display text-white mb-2">Privacy Policy</h1>
      <p className="text-iron-500 text-sm mb-10">Last updated: February 21, 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Information We Collect</h2>
        <p className="text-iron-400 leading-relaxed">
          Bench Only collects information you provide when creating an account (via Google sign-in),
          logging workouts, and using AI features. This includes workout data, body metrics you choose
          to enter, and videos you submit for form analysis.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">How We Use Your Information</h2>
        <p className="text-iron-400 leading-relaxed">
          Your data is used solely to provide and improve the Bench Only service — generating
          personalized workouts, analyzing lifting form, and tracking your progress over time.
          We do not sell your data to third parties.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Third-Party Services</h2>
        <p className="text-iron-400 leading-relaxed">
          Bench Only uses Firebase (Google) for authentication and data storage, and OpenAI for
          AI-powered features. Videos submitted for form analysis are processed by OpenAI and are
          not stored permanently on our servers. If you connect an Oura Ring, your health data is
          fetched from Oura's API and stored in your account to personalize your workouts.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Data Retention</h2>
        <p className="text-iron-400 leading-relaxed">
          You may delete your account and all associated data at any time from the Settings page.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Contact</h2>
        <p className="text-iron-400 leading-relaxed">
          For privacy questions, contact:{' '}
          <a href="mailto:charltonuw@gmail.com" className="text-flame-400 hover:text-flame-300">
            charltonuw@gmail.com
          </a>
        </p>
      </section>
    </div>
  )
}
