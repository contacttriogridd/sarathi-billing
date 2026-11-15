import { TEMPLATES, resolvePdfOptions } from '@/lib/constants';
import type { PdfCompany } from '@/lib/pdf/document';
import type { CompanySettings, Invoice, PdfOptions } from '@/lib/types';

/** Company details for a document: frozen snapshot for issued docs, live settings for drafts. Images are always current. */
export const companyForDocument = (settings: CompanySettings, snapshot: Invoice['snapshot'] | undefined, useSnapshot: boolean): PdfCompany => {
  const base = useSnapshot && snapshot?.company ? { ...settings, ...snapshot.company } : settings;
  return { ...base, logo_url: settings.logo_url, signature_url: settings.signature_url, stamp_url: settings.stamp_url };
};

export const optionsFor = (settings: CompanySettings, docOptions: Partial<PdfOptions> | undefined) => {
  const templateId = docOptions?.template ?? settings.pdf_settings?.template;
  const templateDefaults = TEMPLATES.find((tpl) => tpl.id === templateId)?.defaults;
  return resolvePdfOptions(templateDefaults, settings.pdf_settings, docOptions);
};
