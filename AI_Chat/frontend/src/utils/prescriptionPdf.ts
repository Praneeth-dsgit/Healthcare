import jsPDF from 'jspdf';

export interface PrescriptionMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface PrescriptionPdfOptions {
  patientId: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  prescriptionDate: string;
  diagnosis: string;
  medications: PrescriptionMedication[];
  additionalNotes: string;
  doctorName: string;
  doctorQualification: string;
  doctorLicense: string;
  recipientLabel?: string;
}

const PAGE = { margin: 18, width: 210, height: 297, footerY: 282 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const ACCENT: [number, number, number] = [30, 64, 175];

const DISCLAIMER =
  'This prescription is issued for medical use only. The patient should follow all dosing instructions and consult the prescribing physician before making any changes.';

function normalizeTextForPdf(text: string): string {
  let s = (text || '').normalize('NFKC');
  const replacements: Array<[RegExp, string]> = [
    [/[\u03BC\u00B5]/g, 'u'],
    [/[\u2013\u2014\u2212]/g, '-'],
    [/[\u2018\u2019]/g, "'"],
    [/[\u201C\u201D]/g, '"'],
    [/[\u00A0]/g, ' '],
    [/[\u200B-\u200D\uFEFF]/g, ''],
  ];
  for (const [pattern, replacement] of replacements) {
    s = s.replace(pattern, replacement);
  }
  s = s.replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, (ch) => {
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /^[\x20-\x7E]$/.test(base) ? base : '';
  });
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE.footerY - 8) {
    doc.addPage();
    return PAGE.margin + 8;
  }
  return y;
}

function drawSectionHeading(doc: jsPDF, y: number, title: string): number {
  y = ensureSpace(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(normalizeTextForPdf(title).toUpperCase(), PAGE.margin, y);
  return y + 6;
}

function drawBodyText(doc: jsPDF, y: number, text: string, indent = 0): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const lines = doc.splitTextToSize(normalizeTextForPdf(text), CONTENT_WIDTH - indent);
  y = ensureSpace(doc, y, lines.length * 4.8 + 2);
  doc.text(lines, PAGE.margin + indent, y);
  return y + lines.length * 4.8 + 3;
}

function drawPageFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Acufore Health — Confidential', PAGE.margin, PAGE.footerY);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE.width - PAGE.margin, PAGE.footerY, {
    align: 'right',
  });
}

export function buildPrescriptionPdf(options: PrescriptionPdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rxId = `RX-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  const meds = options.medications.filter((m) => m.name.trim());

  let y = PAGE.margin;

  // Header band
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, PAGE.width, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Acufore Health', PAGE.margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Clinical Pharmacy / Prescriptions', PAGE.margin, 19);
  doc.setFontSize(8);
  doc.text(`Rx ID: ${rxId}`, PAGE.width - PAGE.margin, 12, { align: 'right' });
  doc.text(formatDate(options.prescriptionDate), PAGE.width - PAGE.margin, 19, { align: 'right' });

  y = 36;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Medical Prescription', PAGE.margin, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Official prescription record — For patient and pharmacy use', PAGE.margin, y);
  y += 8;

  // Patient metadata box
  const genderLabel = options.patientGender
    ? options.patientGender.charAt(0).toUpperCase() + options.patientGender.slice(1)
    : 'N/A';
  const metaRows: [string, string][] = [
    ['Date', formatDate(options.prescriptionDate)],
    ['Patient', options.patientName || 'N/A'],
    ['Patient ID', options.patientId || 'N/A'],
    ['Age / Gender', `${options.patientAge || 'N/A'} / ${genderLabel}`],
  ];
  if (options.recipientLabel) {
    metaRows.push(['Prescription for', options.recipientLabel]);
  }
  if (options.diagnosis.trim()) {
    metaRows.push(['Diagnosis', options.diagnosis.trim()]);
  }

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  const boxH = 6 + metaRows.length * 7;
  doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH, boxH, 2, 2, 'FD');
  let metaY = y + 5;
  doc.setFontSize(9);
  for (const [label, value] of metaRows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(`${label}:`, PAGE.margin + 4, metaY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    const valueLines = doc.splitTextToSize(normalizeTextForPdf(value), CONTENT_WIDTH - 42);
    doc.text(valueLines, PAGE.margin + 38, metaY);
    metaY += Math.max(7, valueLines.length * 4.5);
  }
  y += boxH + 6;

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.4);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 8;

  // Medications
  y = drawSectionHeading(doc, y, 'Medications');

  if (meds.length === 0) {
    y = drawBodyText(doc, y, 'No medications listed.');
  } else {
    for (let i = 0; i < meds.length; i++) {
      const med = meds[i];
      y = ensureSpace(doc, y, 28);
      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(PAGE.margin, y - 2, CONTENT_WIDTH, 22, 2, 2, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`${i + 1}. ${normalizeTextForPdf(med.name)}`, PAGE.margin + 4, y + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      const details: string[] = [];
      if (med.dosage.trim()) details.push(`Dosage: ${med.dosage.trim()}`);
      if (med.frequency.trim()) details.push(`Frequency: ${med.frequency.trim()}`);
      if (med.duration.trim()) details.push(`Duration: ${med.duration.trim()}`);
      const detailLine = details.join('  |  ');
      if (detailLine) {
        doc.text(normalizeTextForPdf(detailLine), PAGE.margin + 4, y + 10);
      }
      if (med.instructions.trim()) {
        const instr = doc.splitTextToSize(
          normalizeTextForPdf(`Instructions: ${med.instructions.trim()}`),
          CONTENT_WIDTH - 8
        );
        doc.text(instr, PAGE.margin + 4, y + 15);
        y += instr.length * 4;
      }
      y += 24;
    }
  }

  // Additional notes
  if (options.additionalNotes.trim()) {
    y = drawSectionHeading(doc, y, 'Additional Notes');
    y = drawBodyText(doc, y, options.additionalNotes.trim());
  }

  // Prescriber
  y = ensureSpace(doc, y, 36);
  y = drawSectionHeading(doc, y, 'Prescribed By');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  if (options.doctorName.trim()) {
    doc.text(`Dr. ${normalizeTextForPdf(options.doctorName.trim())}`, PAGE.margin, y);
    y += 5;
  }
  if (options.doctorQualification.trim()) {
    doc.text(normalizeTextForPdf(options.doctorQualification.trim()), PAGE.margin, y);
    y += 5;
  }
  if (options.doctorLicense.trim()) {
    doc.text(`License: ${normalizeTextForPdf(options.doctorLicense.trim())}`, PAGE.margin, y);
    y += 8;
  } else {
    y += 5;
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(PAGE.margin, y, PAGE.margin + 55, y);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Doctor's Signature", PAGE.margin, y + 4);

  // Disclaimer
  y = ensureSpace(doc, y + 12, 24);
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(241, 245, 249);
  const discLines = doc.splitTextToSize(DISCLAIMER, CONTENT_WIDTH - 8);
  const discH = discLines.length * 4.2 + 10;
  doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH, discH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('IMPORTANT NOTICE', PAGE.margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(discLines, PAGE.margin + 4, y + 11);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawPageFooter(doc, p, totalPages);
  }

  return doc;
}

export function prescriptionPdfBlob(options: PrescriptionPdfOptions): Blob {
  return buildPrescriptionPdf(options).output('blob');
}

export function downloadPrescriptionPdf(options: PrescriptionPdfOptions): void {
  const doc = buildPrescriptionPdf(options);
  const slug = options.patientId.replace(/[^\w-]/g, '_') || 'Patient';
  doc.save(`Prescription_${slug}_${options.prescriptionDate}.pdf`);
}
