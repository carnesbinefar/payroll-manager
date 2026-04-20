import sgMail from '@sendgrid/mail';
import { SENDGRID_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME } from '../config';

sgMail.setApiKey(SENDGRID_API_KEY);

export async function sendPayslipEmail(opts: {
  to: string;
  employeeName: string;
  period: string;
  pdfBuffer: Buffer;
  companyName: string;
}): Promise<void> {
  const [year, month] = opts.period.split('-');
  const monthNames: Record<string, string> = {
    '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril',
    '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto',
    '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre',
  };
  const monthName = monthNames[month] || month;
  const filename = `nomina_${monthName}_${year}.pdf`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nómina ${monthName} ${year}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a3c5e;padding:28px 40px;">
              <p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;">${opts.companyName}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#a8c4de;">Gestión de Nóminas</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;font-size:15px;">Hola <strong>${opts.employeeName}</strong>,</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
                Te enviamos adjunta tu nómina correspondiente al mes de
                <strong>${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}</strong>.
              </p>

              <!-- Highlight box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5fb;border-left:4px solid #1a3c5e;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#555;">Documento adjunto</p>
                    <p style="margin:4px 0 0;font-size:15px;font-weight:bold;color:#1a3c5e;">${filename}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
                Si tienes alguna duda sobre tu nómina, contacta con el departamento de administración.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                ${opts.companyName} · Este mensaje es confidencial y está dirigido exclusivamente a su destinatario.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sgMail.send({
    to: opts.to,
    from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
    subject: `Tu nómina de ${monthName} ${year} — ${opts.companyName}`,
    html,
    attachments: [
      {
        filename,
        content: opts.pdfBuffer.toString('base64'),
        type: 'application/pdf',
        disposition: 'attachment',
      },
    ],
  });
}
