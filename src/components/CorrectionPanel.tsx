import React from 'react';
import { Sparkles, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Correction } from '../services/translationService';

interface CorrectionPanelProps {
  corrections: Correction[];
  apiMode: 'gemini' | 'free';
  apiKey: string;
}

export const CorrectionPanel: React.FC<CorrectionPanelProps> = ({
  corrections,
  apiMode,
  apiKey
}) => {
  const isGeminiMode = apiMode === 'gemini' && apiKey.trim() !== '';

  return (
    <div className="corrections-panel">
      <div className="corrections-header">
        <div className="corrections-title">
          <Sparkles size={16} className="text-secondary" />
          <span>Análise Gramatical e Ortográfica</span>
          {corrections.length > 0 && (
            <span className="corrections-badge">{corrections.length}</span>
          )}
        </div>
      </div>

      <div className="corrections-body">
        {corrections.length > 0 ? (
          corrections.map((corr, idx) => (
            <div key={idx} className="correction-card">
              <div className="correction-words">
                <span className="word-original">{corr.original}</span>
                <ArrowRight size={14} className="word-arrow" />
                <span className="word-corrected">{corr.corrected}</span>
              </div>
              <div className="correction-explanation">
                {corr.explanation}
              </div>
            </div>
          ))
        ) : (
          <div className="no-corrections-msg">
            {!isGeminiMode ? (
              <>
                <AlertCircle size={24} style={{ color: 'var(--warning-color)' }} />
                <div>
                  <p style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                    Modo Grátis Limitado
                  </p>
                  <p>
                    As correções ortográficas inteligentes detalhadas requerem o **Gemini AI**.
                    Ative-o nas Configurações no canto inferior esquerdo.
                  </p>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 size={24} style={{ color: 'var(--success-color)' }} />
                <div>
                  <p style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                    Texto Perfeito!
                  </p>
                  <p>Nenhuma correção ortográfica ou gramatical necessária.</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
