export interface ReproductionLink {
  label: string;
  url: string;
}

export interface ReproductionTool {
  id: string;
  name: string;
  description: string;
  links: ReproductionLink[];
}

export const REPRODUCTION_TOOLS: ReproductionTool[] = [
  {
    id: 'fyre',
    name: 'IBM Fyre',
    description: 'Provision test environments',
    links: [
      { label: 'Open Fyre', url: 'https://fyre.ibm.com/' },
      { label: 'Documentation', url: 'https://hashicorp.atlassian.net/wiki/spaces/GSS/pages/5171937765/CSP+Basics+FYRE+Protected+merged+with+Blue+Diamond' },
    ],
  },
  {
    id: 'doormat',
    name: 'Doormat',
    description: 'Access temporary cloud credentials',
    links: [{ label: 'Open Doormat', url: 'https://doormat.hashicorp.services/' }],
  },
  {
    id: 'vett',
    name: 'Vett',
    description: 'Internal reproduction tooling',
    links: [{ label: 'Repository', url: 'https://github.ibm.com/HashiCorp-Support/vett' }],
  },
  {
    id: 'croks',
    name: 'Croks',
    description: 'Internal reproduction tooling',
    links: [{ label: 'Repository', url: 'https://github.ibm.com/HashiCorp-Support/croks' }],
  },
  {
    id: 'enos',
    name: 'Enos',
    description: 'Software Quality as Code scenarios',
    links: [
      { label: 'Framework', url: 'https://github.com/hashicorp/enos' },
      { label: 'Vault', url: 'https://github.com/hashicorp/vault/tree/main/enos' },
      { label: 'Vault Enterprise', url: 'https://github.com/hashicorp/vault-enterprise/tree/main/enos' },
      { label: 'Boundary', url: 'https://github.com/hashicorp/boundary/tree/main/enos' },
      { label: 'Documentation', url: 'https://hashicorp.atlassian.net/wiki/spaces/SSE1/pages/2818146914/Enos' },
    ],
  },
];
