// Translation Service - handles translation and corrections using Gemini API or MyMemory fallback

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface TranslationResult {
  translatedText: string;
  corrections: Correction[];
  detectedLanguage?: string;
}

const languageNames: Record<string, string> = {
  pt: "Portuguese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian"
};

// Translate using Gemini API
async function translateWithGemini(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  modelName: string = 'gemini-1.5-flash'
): Promise<TranslationResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const targetName = languageNames[targetLang] || 'English';

  const prompt = sourceLang === 'auto'
    ? `You are an expert translator and grammarian.
Analyze the following source text:
"${text}"

1. Detect the language of the source text.
2. If the detected language is English, translate it to Portuguese.
3. If the detected language is Portuguese, translate it to English.
4. If it is any other language, translate it to ${targetName}.
5. Detect and correct any spelling, orthographic, or grammatical errors in the source text.
6. Translate the corrected meaning into natural phrasing.
7. In the corrections array, document all spelling corrections or grammatical improvements made, explaining them in Portuguese so the user understands what was corrected.
8. In the detectedLanguage property, return the ISO 639-1 code of the detected language (e.g. "en", "pt", "es", "fr", "de", "it").`
    : `You are an expert translator and grammarian.
Translate the following text from ${languageNames[sourceLang] || 'Portuguese'} to ${targetName}.
Detect and correct any spelling, orthographic, or grammatical errors in the source text.
Translate the corrected meaning.
In the corrections array, document all spelling corrections or grammatical improvements made, explaining them in Portuguese so the user understands what was corrected.
In the detectedLanguage property, return "${sourceLang}".
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
      detectedLanguage: {
        type: 'STRING',
        description: 'The ISO 639-1 code of the detected language (e.g. "en", "pt", "es", "fr", "de", "it").'
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
    required: ['translatedText', 'corrections', 'detectedLanguage']
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
          temperature: 0.1
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
  sourceLang: string,
  targetLang: string
): Promise<TranslationResult> {
  let actualSource = sourceLang;
  let actualTarget = targetLang;

  // Local auto-detection heuristic for MyMemory
  if (sourceLang === 'auto') {
    const englishWords = /\b(the|and|of|to|is|in|that|it|he|was|for|on|are|as|with|his|they|i|at|be|this|have|from|or|one|had|by|word|but|not|what|all|were|we|when|your|can|said|there|use|an|each|which|she|do|how|their|if)\b/i;
    actualSource = englishWords.test(text) ? 'en' : 'pt';
    actualTarget = actualSource === 'en' ? 'pt' : 'en';
  }

  const langPair = `${actualSource}|${actualTarget}`;
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
    const corrections: Correction[] = [];
    
    if (actualSource === 'pt') {
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
      corrections,
      detectedLanguage: actualSource
    };
  } catch (error) {
    console.error("MyMemory translation error:", error);
    throw error;
  }
}

// Translate using OpenAI or OpenRouter API
async function translateWithOpenAI(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  modelName: string,
  provider: 'openai' | 'openrouter'
): Promise<TranslationResult> {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const targetName = languageNames[targetLang] || 'English';

  const prompt = sourceLang === 'auto'
    ? `You are an expert translator and grammarian.
Analyze the following source text:
"${text}"

1. Detect the language of the source text.
2. If the detected language is English, translate it to Portuguese.
3. If the detected language is Portuguese, translate it to English.
4. If it is any other language, translate it to ${targetName}.
5. Detect and correct any spelling, orthographic, or grammatical errors in the source text.
6. Translate the corrected meaning into natural phrasing.
7. In the corrections array, document all spelling corrections or grammatical improvements made, explaining them in Portuguese so the user understands what was corrected.
8. In the detectedLanguage property, return the ISO 639-1 code of the detected language (e.g. "en", "pt", "es", "fr", "de", "it").`
    : `You are an expert translator and grammarian.
Translate the following text from ${languageNames[sourceLang] || 'Portuguese'} to ${targetName}.
Detect and correct any spelling, orthographic, or grammatical errors in the source text.
Translate the corrected meaning.
In the corrections array, document all spelling corrections or grammatical improvements made, explaining them in Portuguese so the user understands what was corrected.
In the detectedLanguage property, return "${sourceLang}".
Text to translate:
"${text}"`;

  const systemPrompt = `You are an expert translator and grammarian.
You must return your response as a JSON object matching this schema:
{
  "translatedText": "string - The final translated text in the target language.",
  "detectedLanguage": "string - The ISO 639-1 code of the detected language (e.g. 'en', 'pt', 'es').",
  "corrections": [
    {
      "original": "string - The incorrect word or segment from the source text.",
      "corrected": "string - The corrected word or segment.",
      "explanation": "string - Explanation in Portuguese of why this was corrected."
    }
  ]
}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/dgsolutionweb/gemini3.5';
    headers['X-Title'] = 'Tradutor macOS';
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName || (provider === 'openai' ? 'gpt-4o-mini' : 'google/gemini-flash-1.5'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody?.error?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errMsg);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;

    if (!rawText) {
      throw new Error(`No response content received from ${provider === 'openai' ? 'OpenAI' : 'OpenRouter'} API`);
    }

    const parsedResult: TranslationResult = JSON.parse(rawText.trim());
    return parsedResult;
  } catch (error) {
    console.error(`${provider} translation error:`, error);
    throw error;
  }
}

// Main translation entry point
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiMode: 'gemini' | 'openai' | 'openrouter' | 'free',
  apiKey: string,
  modelName: string = 'gemini-1.5-flash'
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { translatedText: '', corrections: [] };
  }

  let result: TranslationResult;
  try {
    if (apiMode === 'gemini' && apiKey) {
      result = await translateWithGemini(trimmed, sourceLang, targetLang, apiKey, modelName);
    } else if (apiMode === 'openai' && apiKey) {
      result = await translateWithOpenAI(trimmed, sourceLang, targetLang, apiKey, modelName, 'openai');
    } else if (apiMode === 'openrouter' && apiKey) {
      result = await translateWithOpenAI(trimmed, sourceLang, targetLang, apiKey, modelName, 'openrouter');
    } else {
      result = await translateWithMyMemory(trimmed, sourceLang, targetLang);
    }
  } catch (error) {
    console.error("Translation API execution failed, falling back to MyMemory:", error);
    result = await translateWithMyMemory(trimmed, sourceLang, targetLang);
  }

  return {
    translatedText: result?.translatedText || '',
    corrections: Array.isArray(result?.corrections) ? result.corrections : [],
    detectedLanguage: result?.detectedLanguage || (sourceLang !== 'auto' ? sourceLang : 'en')
  };
}
