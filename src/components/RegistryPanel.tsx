import React from "react";
import { Building2, MapPin, AlertCircle, Loader2 } from "lucide-react";
import { CepDetails, CnpjDetails, LookupResult } from "../services/brDataService";

interface RegistryPanelProps {
  results: LookupResult[];
  isLoading: boolean;
}

const formatCnpj = (value: string) => value.replace(
  /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
  "$1.$2.$3/$4-$5"
);

const formatCep = (value: string) => value.replace(/^(\d{5})(\d{3})$/, "$1-$2");

const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="registry-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
};

function renderCnpj(data: CnpjDetails) {
  return (
    <>
      <InfoRow label="Razao social" value={data.razaoSocial} />
      <InfoRow label="Nome fantasia" value={data.nomeFantasia} />
      <InfoRow label="Situacao" value={data.situacao} />
      <InfoRow label="Abertura" value={data.abertura} />
      <InfoRow label="Porte" value={data.porte} />
      <InfoRow label="Natureza juridica" value={data.naturezaJuridica} />
      <InfoRow label="Atividade principal" value={data.atividadePrincipal} />
      <InfoRow label="Endereco" value={data.endereco} />
      <InfoRow label="Municipio/UF" value={[data.municipio, data.uf].filter(Boolean).join(" / ")} />
      <InfoRow label="CEP" value={data.cep ? formatCep(data.cep) : undefined} />
      <InfoRow label="Telefone" value={data.telefone} />
      <InfoRow label="E-mail" value={data.email} />
    </>
  );
}

function renderCep(data: CepDetails) {
  return (
    <>
      <InfoRow label="Logradouro" value={data.logradouro} />
      <InfoRow label="Complemento" value={data.complemento} />
      <InfoRow label="Bairro" value={data.bairro} />
      <InfoRow label="Cidade/UF" value={[data.cidade, data.uf].filter(Boolean).join(" / ")} />
      <InfoRow label="Estado" value={data.estado} />
      <InfoRow label="Regiao" value={data.regiao} />
      <InfoRow label="IBGE" value={data.ibge} />
      <InfoRow label="DDD" value={data.ddd} />
      <InfoRow label="Servico" value={data.service} />
    </>
  );
}

export const RegistryPanel: React.FC<RegistryPanelProps> = ({ results, isLoading }) => {
  if (!isLoading && results.length === 0) return null;

  return (
    <section className="registry-panel">
      <div className="registry-header">
        <div className="registry-title">
          {isLoading ? <Loader2 size={16} className="registry-spin" /> : <Building2 size={16} />}
          <span>Dados publicos detectados</span>
        </div>
      </div>

      <div className="registry-body">
        {isLoading && results.length === 0 ? (
          <div className="registry-empty">Consultando CNPJ/CEP encontrado no recorte...</div>
        ) : (
          results.map((result) => (
            <article key={result.id} className={`registry-card ${result.status}`}>
              <div className="registry-card-header">
                <div className="registry-card-title">
                  {result.type === "cnpj" ? <Building2 size={15} /> : <MapPin size={15} />}
                  <span>{result.type === "cnpj" ? "CNPJ" : "CEP"}</span>
                  <strong>{result.type === "cnpj" ? formatCnpj(result.query) : formatCep(result.query)}</strong>
                </div>
                <span className="registry-source">{result.source}</span>
              </div>

              {result.status === "error" ? (
                <div className="registry-error">
                  <AlertCircle size={15} />
                  <span>{result.error}</span>
                </div>
              ) : result.type === "cnpj" ? (
                renderCnpj(result.data as CnpjDetails)
              ) : (
                renderCep(result.data as CepDetails)
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};
