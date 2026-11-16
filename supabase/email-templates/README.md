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
Configuration) — every link is built from it. The logo is a fixed address
(`https://banaadirmall.com/banaadir-logo.png`, a PNG — Gmail and Outlook don't
show SVG or WebP), because Supabase's template preview leaves `{{ .SiteURL }}`
unfilled and the image showed as broken there.

To send from `no-reply@banaadirmall.com` instead of Supabase, connect a mail
service under **Authentication → Emails → SMTP Settings** (see the main README).
