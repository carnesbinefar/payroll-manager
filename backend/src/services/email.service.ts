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

  await sgMail.send({
    to: opts.to,
    from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
    subject: `Tu nómina de ${monthName} ${year} — ${opts.companyName}`,
    html: `
      <p>Hola ${opts.employeeName},</p>
      <p>Adjuntamos tu nómina correspondiente al mes de <strong>${monthName} de ${year}</strong>.</p>
      <p>Si tienes alguna duda, no dudes en contactar con el departamento de administración.</p>
      <p>Un saludo,<br>${opts.companyName}</p>
    `,
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
