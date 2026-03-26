export type ParamIdOption = {
  id: string;
  description: string;
  notes: string;
  paramId: string;
};

export const PARAM_ID_CATALOG: ParamIdOption[] = [
  { id: '1', description: 'Dossieritem', notes: 'Tonen pagina', paramId: 'SbId' },
  { id: '2', description: 'Persoon', notes: 'Tonen pagina', paramId: 'BcId' },
  { id: '3', description: 'Organisatie', notes: 'Tonen pagina', paramId: 'BcId' },
  { id: '4', description: 'Contactpersoon', notes: 'Tonen pagina', paramId: 'CdId' },
  { id: '5', description: 'Medewerker', notes: 'MSS Tonen / Medewerker basis', paramId: 'EmId' },
  { id: '7', description: 'Abonnement', notes: 'Tonen pagina', paramId: 'SuNr' },
  { id: '8', description: 'Organisatie/persoon', notes: 'Tonen pagina', paramId: 'BcId' },
  { id: '9', description: 'Financiele factuur', notes: 'Tonen pagina', paramId: 'PiId' },
  { id: '11', description: 'Debiteur', notes: 'Tonen pagina', paramId: 'DbId' },
  { id: '12', description: 'Crediteur', notes: 'Tonen pagina', paramId: 'CrId' },
  { id: '13', description: 'Profit afspraak', notes: 'Tonen pagina', paramId: 'ApId' },
  { id: '16', description: 'Project', notes: 'Tonen pagina / teamrolpagina', paramId: 'PrId' },
  { id: '17', description: 'Team', notes: 'Tonen pagina', paramId: 'TeId' },
  { id: '18', description: 'Voorcalculatie', notes: 'Tonen pagina', paramId: 'QuId' },
  { id: '19', description: 'Medewerker vrije contactbestanden', notes: 'Tonen pagina (kan gebruikt worden voor ESS)', paramId: 'EcId' },
  { id: '20', description: 'Evenement', notes: 'Tonen pagina', paramId: 'CrId' },
  { id: '23', description: 'Productgroep', notes: 'Tonen pagina', paramId: 'PrGr' },
  { id: '24', description: 'Item', notes: 'Tonen pagina', paramId: 'BiId' },
  { id: '25', description: 'Pakbon', notes: 'Tonen pagina', paramId: 'OrNu' },
  { id: '26', description: 'Verkooporder', notes: 'Tonen pagina', paramId: 'OrNu' },
  { id: '27', description: 'Verkoopfactuur', notes: 'Tonen pagina', paramId: 'OrNu' },
  { id: '28', description: 'Vacature', notes: 'Tonen pagina', paramId: 'VcSn' },
  { id: '29', description: 'Sollicitant', notes: 'Tonen pagina', paramId: 'ApId' },
  { id: '30', description: 'Forecast', notes: 'Tonen pagina', paramId: 'FoId' },
  { id: '34', description: 'HRM Mutatie', notes: 'Tonen pagina', paramId: 'SbId' },
  { id: '36', description: 'Verlofboeking', notes: 'Tonen pagina', paramId: 'LeId' },
  { id: '37', description: 'Ziekmelding', notes: 'Tonen pagina', paramId: 'AbId' },
  { id: '39', description: 'Projectactiviteit', notes: 'Tonen pagina', paramId: 'PaId' },
];

export function findParamIdOption(paramId?: string) {
  const normalized = paramId?.trim().toLowerCase();
  if (!normalized) return undefined;
  return PARAM_ID_CATALOG.find((option) => option.paramId.toLowerCase() === normalized);
}
