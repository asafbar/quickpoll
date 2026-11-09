import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Notice, PageIntro } from "../../components/PollUi";
import { ApiError, loginOrganizer, registerOrganizer } from "../../services/api";
import { normalizeEmail, validEmail, validPassword } from "./credentials";

export function AuthForm({ register }: { register: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const submitting = useRef(false);
  const normalizedEmail = normalizeEmail(email);
  const invalidEmail = email !== "" && !validEmail(normalizedEmail);
  const invalidPassword = password !== "" && !validPassword(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !validEmail(normalizedEmail) || !validPassword(password)) return;
    submitting.current = true;
    setPending(true);
    setError("");

    try {
      if (register) {
        await registerOrganizer(normalizedEmail, password);
        setPassword("");
        setRegistered(true);
      } else {
        await loginOrganizer(normalizedEmail, password);
        window.location.replace("/my-polls");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && register) {
        setError("Could not create an account with that email. If you already have an account, sign in.");
      } else if (error instanceof ApiError && error.status === 403) {
        setError("This web address is not allowed for account actions. Open QuickPoll from an approved address.");
      } else {
        setError(error instanceof Error ? error.message : "Could not complete your request. Try again.");
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <section className="shell py-9 sm:py-14">
      <div className="mx-auto max-w-lg">
        <PageIntro label="Organizer account" title={register ? "Create an account" : "Sign in"}>
          {register ? "Save your polls to an account you can use on other devices." : "Access and manage the polls saved to your account."}
        </PageIntro>
        {registered ? (
          <div className="panel grid justify-items-start gap-4 p-5 sm:p-7">
            <Notice>Your account is ready. Sign in to start saving polls.</Notice>
            <a className="btn btn-primary" href="/login">Sign in</a>
          </div>
        ) : (
          <form className="panel p-5 sm:p-7" method="post" onSubmit={submit} noValidate>
            <fieldset disabled={pending} className="grid min-w-0 gap-4">
              <div>
                <label htmlFor="account-email" className="mb-2 block font-bold">Email address</label>
                <input id="account-email" name="email" className="field" type="email" autoComplete="username"
                  value={email} required aria-invalid={invalidEmail} aria-describedby={invalidEmail ? "email-hint" : undefined}
                  onChange={(event) => setEmail(event.target.value)} />
                {invalidEmail && <p id="email-hint" className="mt-1 text-sm text-danger">Enter a valid email address.</p>}
              </div>
              <div>
                <label htmlFor="account-password" className="mb-2 block font-bold">Password</label>
                <input id="account-password" name="password" className="field" type="password"
                  autoComplete={register ? "new-password" : "current-password"} value={password} required
                  aria-invalid={invalidPassword} aria-describedby={register || invalidPassword ? "password-hint" : undefined}
                  onChange={(event) => setPassword(event.target.value)} />
                {(register || invalidPassword) && <p id="password-hint" className={"mt-1 text-sm " + (invalidPassword ? "text-danger" : "text-muted")}>
                  Use 8 to 128 characters.
                </p>}
              </div>
              {error && <Notice error>{error}</Notice>}
              <button className="btn btn-primary min-h-12" type="submit"
                disabled={!validEmail(normalizedEmail) || !validPassword(password)}>
                {pending ? (register ? "Creating account…" : "Signing in…") : register ? "Create account" : "Sign in"}
              </button>
            </fieldset>
            <p className="mt-5 text-sm text-muted">
              {register ? "Already registered? " : "New to QuickPoll? "}
              <a className="font-bold text-accent-bright underline underline-offset-4" href={register ? "/login" : "/register"}>
                {register ? "Sign in" : "Create an account"}
              </a>
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
