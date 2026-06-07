package handlers

const setupEmailSubject = "Dein Zugang zu Mein Kochbuch – Passwort festlegen"

// renderSetupEmail returns the HTML for the initial password-setup email.
// Email-client-safe: table layout, inline styles, web-safe serif (Georgia) to
// echo the app's DM Serif Display heading. actionURL is built from our own
// oobCode (no user-controlled content), so interpolating it is safe.
func renderSetupEmail(actionURL string) string {
	return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#FAF6EF;-webkit-text-size-adjust:100%;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">Lege dein Passwort fest und leg los mit deinem Kochbuch.</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF6EF;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin:0 auto;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:26px;">
              <div style="font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#7A6B5A;padding-bottom:6px;">Mein</div>
              <div style="font:400 36px/1 Georgia,'Times New Roman',serif;color:#2A1F14;letter-spacing:-0.5px;">Kochbuch</div>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:18px;padding:34px 32px;box-shadow:0 4px 24px rgba(80,50,20,0.08);">
              <h1 style="margin:0 0 12px;font:400 23px/1.3 Georgia,'Times New Roman',serif;color:#2A1F14;">Willkommen in deinem Kochbuch!</h1>
              <p style="margin:0 0 24px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#5b4d3e;">
                Dein Konto wurde angelegt. Lege jetzt in einem Schritt dein Passwort fest – danach kannst du dich direkt anmelden.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#C2410C" style="border-radius:12px;">
                    <a href="` + actionURL + `" target="_blank" style="display:inline-block;padding:14px 30px;font:700 15px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:12px;background:#C2410C;">Passwort festlegen</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7A6B5A;">
                Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
                <a href="` + actionURL + `" target="_blank" style="color:#C2410C;word-break:break-all;">` + actionURL + `</a>
              </p>
              <hr style="border:none;border-top:1px solid rgba(120,90,60,0.15);margin:24px 0 0;">
              <p style="margin:18px 0 0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#9b8b7a;">
                Der Link ist nur begrenzt gültig. Falls du keinen Zugang angefordert hast, kannst du diese E-Mail einfach ignorieren.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:22px;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#9b8b7a;">
              Mein Kochbuch
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
