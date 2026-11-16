# Branded account emails

Paste these into **Supabase → Authentication → Emails → Templates**. Each one
uses `{{ .TokenHash }}` links, so it works even when the email is opened in a
different browser or app than the one that asked.

| Template | Subject | File |
|---|---|---|
| Confirm sign up | `Confirm your email · Banaadir Mall` | `confirm-signup.html` |
| Reset password | `Reset your password · Banaadir Mall` | `reset-password.html` |
| Change email address | `Confirm your new email · Banaadir Mall` | `change-email.html` |

They need **Site URL** set to `https://banaadirmall.com` (Authentication → URL
Configuration) — the logo and every link are built from it.

To send from `no-reply@banaadirmall.com` instead of Supabase, connect a mail
service under **Authentication → Emails → SMTP Settings** (see the main README).
