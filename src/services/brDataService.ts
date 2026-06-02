export interface DetectedIdentifier {
  type: "cnpj" | "cep";
  raw: string;
  normalized: string;
}

export interface CnpjDetails {
  cnpj: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  situacao?: string;
  abertura?: string;
  naturezaJuridica?: string;
  porte?: string;
  atividadePrincipal?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

export interface CepDetails {
  cep: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  estado?: string;
  regiao?: string;
  ibge?: string;
  ddd?: string;
  service?: string;
}

export interface LookupResult {
  id: string;
  type: "cnpj" | "cep";
  query: string;
  status: "success" | "error";
  source: string;
  data?: CnpjDetails | CepDetails;
  error?: string;
}

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function isValidCnpj(cnpj: string) {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;

  const calcCheckDigit = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const first = calcCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calcCheckDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(digits[12]) && second === Number(digits[13]);
}

function uniqueByNormalized(items: DetectedIdentifier[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractBrazilianIdentifiers(text: string): DetectedIdentifier[] {
  const identifiers: DetectedIdentifier[] = [];

  const cnpjRegex = /(?:\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b)/g;
  const cepRegex = /(?:\b\d{5}-?\d{3}\b)/g;

  for (const match of text.matchAll(cnpjRegex)) {
    const raw = match[0];
    const normalized = onlyDigits(raw);
    if (isValidCnpj(normalized)) {
      identifiers.push({ type: "cnpj", raw, normalized });
    }
  }

  for (const match of text.matchAll(cepRegex)) {
    const raw = match[0];
    const normalized = onlyDigits(raw);
    if (normalized.length === 8) {
      identifiers.push({ type: "cep", raw, normalized });
    }
  }

  return uniqueByNormalized(identifiers);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function normalizeCnpjResponse(data: any): CnpjDetails {
  const mainActivity = Array.isArray(data.cnae_fiscal_descricao)
    ? data.cnae_fiscal_descricao[0]
    : data.cnae_fiscal_descricao;

  const enderecoParts = [
    data.descricao_tipo_de_logradouro,
    data.logradouro,
    data.numero,
    data.complemento,
    data.bairro,
  ].filter(Boolean);

  return {
    cnpj: data.cnpj,
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia,
    situacao: data.descricao_situacao_cadastral,
    abertura: data.data_inicio_atividade,
    naturezaJuridica: data.natureza_juridica,
    porte: data.porte,
    atividadePrincipal: mainActivity,
    telefone: [data.ddd_telefone_1, data.ddd_telefone_2].filter(Boolean).join(" / "),
    email: data.email,
    endereco: enderecoParts.join(", "),
    municipio: data.municipio,
    uf: data.uf,
    cep: data.cep,
  };
}

function normalizeBrasilApiCepResponse(data: any): CepDetails {
  return {
    cep: data.cep,
    logradouro: data.street,
    bairro: data.neighborhood,
    cidade: data.city,
    uf: data.state,
    service: data.service,
  };
}

function normalizeViaCepResponse(data: any): CepDetails {
  return {
    cep: data.cep,
    logradouro: data.logradouro,
    complemento: data.complemento,
    bairro: data.bairro,
    cidade: data.localidade,
    uf: data.uf,
    estado: data.estado,
    regiao: data.regiao,
    ibge: data.ibge,
    ddd: data.ddd,
    service: "ViaCEP",
  };
}

async function lookupCnpj(cnpj: string): Promise<LookupResult> {
  try {
    const data = await fetchJson<any>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    return {
      id: `cnpj-${cnpj}`,
      type: "cnpj",
      query: cnpj,
      status: "success",
      source: "BrasilAPI",
      data: normalizeCnpjResponse(data),
    };
  } catch {
    try {
      const data = await fetchJson<any>(`https://minhareceita.org/${cnpj}`);
      return {
        id: `cnpj-${cnpj}`,
        type: "cnpj",
        query: cnpj,
        status: "success",
        source: "Minha Receita",
        data: normalizeCnpjResponse(data),
      };
    } catch (error: any) {
      return {
        id: `cnpj-${cnpj}`,
        type: "cnpj",
        query: cnpj,
        status: "error",
        source: "BrasilAPI / Minha Receita",
        error: error?.message || "Nao foi possivel consultar o CNPJ.",
      };
    }
  }
}

async function lookupCep(cep: string): Promise<LookupResult> {
  try {
    const data = await fetchJson<any>(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    return {
      id: `cep-${cep}`,
      type: "cep",
      query: cep,
      status: "success",
      source: "BrasilAPI",
      data: normalizeBrasilApiCepResponse(data),
    };
  } catch {
    try {
      const data = await fetchJson<any>(`https://viacep.com.br/ws/${cep}/json/`);
      if (data?.erro) throw new Error("CEP nao encontrado.");
      return {
        id: `cep-${cep}`,
        type: "cep",
        query: cep,
        status: "success",
        source: "ViaCEP",
        data: normalizeViaCepResponse(data),
      };
    } catch (error: any) {
      return {
        id: `cep-${cep}`,
        type: "cep",
        query: cep,
        status: "error",
        source: "BrasilAPI / ViaCEP",
        error: error?.message || "Nao foi possivel consultar o CEP.",
      };
    }
  }
}

export async function lookupBrazilianIdentifiers(text: string): Promise<LookupResult[]> {
  const identifiers = extractBrazilianIdentifiers(text);
  if (identifiers.length === 0) return [];

  return Promise.all(
    identifiers.map((identifier) => (
      identifier.type === "cnpj"
        ? lookupCnpj(identifier.normalized)
        : lookupCep(identifier.normalized)
    ))
  );
}
