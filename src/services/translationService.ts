// Translation Service - handles translation and corrections using Gemini API or MyMemory fallback

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface TranslationResult {
  translatedText: string;
  corrections: Correction[];
}

// Translate using Gemini API
async function translateWithGemini(
  text: string,
  sourceLang: 'pt' | 'en',
  apiKey: string,
  modelName: string = 'gemini-1.5-flash'
): Promise<TranslationResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = sourceLang === 'pt'
    ? `You are an expert translator and grammarian.
Translate the following text from Portuguese to English. 
Detect and correct any spelling, orthographic, or grammatical errors in the Portuguese text. 
Translate the corrected meaning into natural, correct English.
In the corrections array, document all spelling corrections or grammatical improvements made, explaining them in Portuguese so the user understands what was corrected.
Text to translate:
"${text}"`
    : `You are an expert translator and grammarian.
Translate the following text from English to Portuguese.
Detect and correct any spelling or grammatical errors in the English text.
Translate the corrected meaning into natural, correct Portuguese.
In the corrections array, document all spelling corrections or grammatical improvements made, explaining them in Portuguese so the user understands what was corrected.
Text to translate:
"${text}"`;

  // Define response schema for Gemini Structured Output
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      translatedText: {
        type: 'STRING',
        description: 'The final translated text in the target language.'
      },
      corrections: {
        type: 'ARRAY',
        description: 'List of orthographic, spelling, grammatical, or stylistic corrections made.',
        items: {
          type: 'OBJECT',
          properties: {
            original: {
              type: 'STRING',
              description: 'The incorrect word or segment from the source text.'
            },
            corrected: {
              type: 'STRING',
              description: 'The corrected word or segment in the target language context, or corrected spelling in source.'
            },
            explanation: {
              type: 'STRING',
              description: 'Explanation in Portuguese of why this was corrected.'
            }
          },
          required: ['original', 'corrected', 'explanation']
        }
      }
    },
    required: ['translatedText', 'corrections']
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.1 // Low temperature for high accuracy/determinism
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody?.error?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errMsg);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) {
      throw new Error("No response content received from Gemini API");
    }

    const parsedResult: TranslationResult = JSON.parse(rawText.trim());
    return parsedResult;
  } catch (error) {
    console.error("Gemini translation error:", error);
    throw error;
  }
}

// Translate using MyMemory Free Translation API
async function translateWithMyMemory(
  text: string,
  sourceLang: 'pt' | 'en',
  targetLang: 'pt' | 'en'
): Promise<TranslationResult> {
  const langPair = `${sourceLang}|${targetLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MyMemory API HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (data.responseStatus !== 200) {
      throw new Error(data.responseDetails || "MyMemory translation failed");
    }

    const translatedText = data.responseData.translatedText;
    
    // In Free Mode, we do not have an LLM to analyze complex grammar, 
    // but we can detect simple orthographic issues locally or just return a helper correction.
    const corrections: Correction[] = [];
    
    // Quick client-side check for common Portuguese spelling omissions if translating from pt to en
    if (sourceLang === 'pt') {
      const commonChecks = [
        { regex: /\bnao\b/gi, correct: 'não', explanation: "Falta do til (~)." },
        { regex: /\beu vo\b/gi, correct: 'eu vou', explanation: "Conjugação do verbo ir." },
        { regex: /\bcoracao\b/gi, correct: 'coração', explanation: "Falta da cedilha (ç) e til (~)." },
        { regex: /\bvoce\b/gi, correct: 'você', explanation: "Falta do acento circunflexo (^)." },
        { regex: /\bta\b/gi, correct: 'está', explanation: "Forma coloquial reduzida, prefira 'está'." }
      ];

      commonChecks.forEach(check => {
        if (check.regex.test(text)) {
          corrections.push({
            original: text.match(check.regex)?.[0] || 'palavra',
            corrected: check.correct,
            explanation: `${check.explanation} (Detecção básica local)`
          });
        }
      });
    }

    return {
      translatedText,
      corrections
    };
  } catch (error) {
    console.error("MyMemory translation error:", error);
    throw error;
  }
}

// Main translation entry point
export async function translateText(
  text: string,
  sourceLang: 'pt' | 'en',
  targetLang: 'pt' | 'en',
  apiMode: 'gemini' | 'free',
  apiKey: string,
  modelName: string = 'gemini-1.5-flash'
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { translatedText: '', corrections: [] };
  }

  if (apiMode === 'gemini' && apiKey) {
    return translateWithGemini(trimmed, sourceLang, apiKey, modelName);
  } else {
    return translateWithMyMemory(trimmed, sourceLang, targetLang);
  }
}
