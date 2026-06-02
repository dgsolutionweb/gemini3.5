import React from "react";
import { Archive, Download, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { LookupResult } from "../services/brDataService";

export interface CaptureRecord {
  id: string;
  timestamp: number;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  imageDataUrl?: string;
  registryResults: LookupResult[];
  codes: Array<{ data: string; format: string }>;
}

interface CaptureCenterProps {
  captures: CaptureRecord[];
  activeCaptureId: string | null;
  onSelect: (capture: CaptureRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function registryToText(results: LookupResult[]) {
  if (results.length === 0) return "Nenhum CNPJ/CEP detectado.";

  return results.map((result) => {
    if (result.status === "error") {
      return `${result.type.toUpperCase()} ${result.query}: ${result.error}`;
    }

    const data = result.data as unknown as Record<string, string | undefined>;
    const rows = Object.entries(data)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");

    return `### ${result.type.toUpperCase()} ${result.query}\nFonte: ${result.source}\n${rows}`;
  }).join("\n\n");
}

function buildMarkdown(capture: CaptureRecord) {
  return `# Relatorio LingoSnap

Data: ${new Date(capture.timestamp).toLocaleString()}
Idiomas: ${capture.sourceLang.toUpperCase()} -> ${capture.targetLang.toUpperCase()}

## Texto original

${capture.sourceText || "Sem texto OCR."}

## Traducao

${capture.translatedText || "Sem traducao."}

## Dados publicos

${registryToText(capture.registryResults)}

## Codigos detectados

${capture.codes.length > 0
  ? capture.codes.map((code) => `- ${code.format}: ${code.data}`).join("\n")
  : "Nenhum codigo detectado."}
`;
}

function buildHtml(capture: CaptureRecord) {
  const escape = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatorio LingoSnap</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #1d1d1f; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    pre { white-space: pre-wrap; line-height: 1.45; background: #f6f6f6; padding: 12px; border-radius: 8px; }
    img { max-width: 360px; border: 1px solid #ddd; border-radius: 8px; }
    .meta { color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Relatorio LingoSnap</h1>
  <div class="meta">${new Date(capture.timestamp).toLocaleString()} | ${capture.sourceLang.toUpperCase()} -> ${capture.targetLang.toUpperCase()}</div>
  ${capture.imageDataUrl ? `<h2>Captura</h2><img src="${capture.imageDataUrl}" alt="Captura" />` : ""}
  <h2>Texto original</h2>
  <pre>${escape(capture.sourceText || "Sem texto OCR.")}</pre>
  <h2>Traducao</h2>
  <pre>${escape(capture.translatedText || "Sem traducao.")}</pre>
  <h2>Dados publicos</h2>
  <pre>${escape(registryToText(capture.registryResults))}</pre>
  <h2>Codigos detectados</h2>
  <pre>${escape(capture.codes.length > 0 ? capture.codes.map((code) => `${code.format}: ${code.data}`).join("\n") : "Nenhum codigo detectado.")}</pre>
</body>
</html>`;
}

export const CaptureCenter: React.FC<CaptureCenterProps> = ({
  captures,
  activeCaptureId,
  onSelect,
  onDelete,
  onClear,
}) => {
  return (
    <section className="capture-center">
      <div className="capture-center-header">
        <div className="capture-center-title">
          <Archive size={16} />
          <span>Central de Capturas</span>
          <span className="capture-count">{captures.length}</span>
        </div>
        {captures.length > 0 && (
          <button className="footer-btn" title="Limpar capturas" onClick={onClear}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="capture-list">
        {captures.length === 0 ? (
          <div className="capture-empty">
            <ImageIcon size={22} />
            <span>Nenhuma captura registrada</span>
          </div>
        ) : (
          captures.map((capture) => (
            <article
              key={capture.id}
              className={`capture-item ${activeCaptureId === capture.id ? "active" : ""}`}
              onClick={() => onSelect(capture)}
            >
              {capture.imageDataUrl ? (
                <img className="capture-thumb" src={capture.imageDataUrl} alt="Captura" />
              ) : (
                <div className="capture-thumb-placeholder">
                  <ImageIcon size={18} />
                </div>
              )}

              <div className="capture-info">
                <div className="capture-meta">{formatDate(capture.timestamp)} | {capture.sourceLang.toUpperCase()} {"->"} {capture.targetLang.toUpperCase()}</div>
                <div className="capture-source">{capture.sourceText || "Sem texto OCR"}</div>
                <div className="capture-result">{capture.translatedText || "Sem traducao"}</div>
              </div>

              <div className="capture-actions" onClick={(event) => event.stopPropagation()}>
                <button
                  className="footer-btn"
                  title="Exportar Markdown"
                  onClick={() => downloadFile(`lingosnap-${capture.id}.md`, buildMarkdown(capture), "text/markdown;charset=utf-8")}
                >
                  <Download size={13} />
                </button>
                <button
                  className="footer-btn"
                  title="Exportar HTML"
                  onClick={() => downloadFile(`lingosnap-${capture.id}.html`, buildHtml(capture), "text/html;charset=utf-8")}
                >
                  <FileText size={13} />
                </button>
                <button className="footer-btn" title="Apagar captura" onClick={() => onDelete(capture.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
};
