interface Props {
  onSignIn: () => void
  busy: boolean
  error: string | null
}

export default function SignIn({ onSignIn, busy, error }: Props): React.JSX.Element {
  return (
    <main className="signin">
      <div className="signin__drag" aria-hidden="true" />
      <section className="signin__card">
        <div className="signin__mark" aria-hidden="true">
          <span>{new Date().getDate()}</span>
        </div>
        <h1>Calendar Desk</h1>
        <p className="signin__lede">
          Your Google Calendar week, on the desktop. Sign in once and the app keeps you signed in on this
          machine.
        </p>
        <button type="button" className="btn btn--primary btn--lg" onClick={onSignIn} disabled={busy}>
          {busy ? 'Waiting for Google…' : 'Continue with Google'}
        </button>
        <p className="signin__hint">
          {busy
            ? 'Finish signing in in your browser, then come back here.'
            : 'Your browser will open to Google’s sign-in page.'}
        </p>
        {error && (
          <p className="signin__error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
