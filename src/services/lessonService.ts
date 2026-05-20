// Lesson Service - generates mini language lessons and quizzes based on translation pairs

export interface GrammarPoint {
  point: string;
  explanation: string;
  exampleOriginal: string;
  exampleTranslated: string;
}

export interface VocabularyItem {
  word: string;
  meaning: string;
  usage: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonResult {
  lessonTitle: string;
  grammarPoints: GrammarPoint[];
  vocabulary: VocabularyItem[];
  quiz: QuizQuestion;
}

const languageNames: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
  fr: "Francês",
  de: "Alemão",
  it: "Italiano"
};

// Offline Mock Lesson Fallback
function generateMockLesson(sourceText: string, targetLang: string): LessonResult {
  // Extract words from source text
  const cleanWords = sourceText.replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3);
  const sampleWords = cleanWords.slice(0, 3);
  
  const vocab: VocabularyItem[] = sampleWords.map((word) => ({
    word: word,
    meaning: `Significado ou termo equivalente no contexto (${languageNames[targetLang] || 'Destino'}).`,
    usage: `Exemplo prático de uso da palavra "${word}".`
  }));

  if (vocab.length === 0) {
    vocab.push({
      word: "Exemplo",
      meaning: "Termo de demonstração offline.",
      usage: "Este é um exemplo de palavra para fins de estudo."
    });
  }

  return {
    lessonTitle: "Lição Prática de Vocabulário (Modo Local)",
    grammarPoints: [
      {
        point: "Estrutura Básica da Frase",
        explanation: "Em expressões curtas, observe a ordem das palavras e adjetivos no idioma correspondente.",
        exampleOriginal: sourceText,
        exampleTranslated: "Tradução correspondente da sua captura."
      }
    ],
    vocabulary: vocab,
    quiz: {
      question: `Qual o sentido ou aplicação principal do termo "${vocab[0].word}" no texto original?`,
      options: [
        "Tem o sentido de ação continuada no presente.",
        "Refere-se ao assunto principal discutido no texto.",
        "Representa uma preposição de lugar ou tempo.",
        "Nenhuma das alternativas anteriores está correta."
      ],
      correctIndex: 1,
      explanation: `O termo "${vocab[0].word}" faz parte da frase original recortada e representa o vocabulário chave da lição.`
    }
  };
}

// Generate using Gemini API
async function generateWithGemini(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  modelName: string = 'gemini-1.5-flash'
): Promise<LessonResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const sourceName = languageNames[sourceLang] || sourceLang;

  const prompt = `You are a professional language tutor.
Create a mini-lesson in Portuguese to help a student learn the language of the source text (${sourceName}) based on the captured translation pair:
Source Text (${sourceLang}): "${sourceText}"
Translated Text (${targetLang}): "${translatedText}"

Requirements:
1. Explain 1-2 grammar points observed in the source text.
2. Define 2-3 important vocabulary words or idioms from the source text.
3. Create a 4-option multiple-choice quiz question in Portuguese testing the student on these words or grammar points.
4. Keep all explanations, meanings, and quiz elements in Portuguese so the student can study easily.

Return a JSON object matching this schema:
{
  "lessonTitle": "A short, engaging title for the lesson.",
  "grammarPoints": [
    {
      "point": "Name of the grammar concept.",
      "explanation": "Brief explanation in Portuguese.",
      "exampleOriginal": "An example sentence in the source language.",
      "exampleTranslated": "The Portuguese translation of the example sentence."
    }
  ],
  "vocabulary": [
    {
      "word": "Word or idiom from the source text.",
      "meaning": "Meaning or translation of the word in Portuguese.",
      "usage": "Example of usage in a short sentence in the source language."
    }
  ],
  "quiz": {
    "question": "A multiple-choice question in Portuguese.",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0, // 0-based index of the correct answer
    "explanation": "Detailed explanation in Portuguese of why the answer is correct."
  }
}`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      lessonTitle: { type: 'STRING' },
      grammarPoints: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            point: { type: 'STRING' },
            explanation: { type: 'STRING' },
            exampleOriginal: { type: 'STRING' },
            exampleTranslated: { type: 'STRING' }
          },
          required: ['point', 'explanation', 'exampleOriginal', 'exampleTranslated']
        }
      },
      vocabulary: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            word: { type: 'STRING' },
            meaning: { type: 'STRING' },
            usage: { type: 'STRING' }
          },
          required: ['word', 'meaning', 'usage']
        }
      },
      quiz: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          correctIndex: { type: 'INTEGER' },
          explanation: { type: 'STRING' }
        },
        required: ['question', 'options', 'correctIndex', 'explanation']
      }
    },
    required: ['lessonTitle', 'grammarPoints', 'vocabulary', 'quiz']
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.3
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini lesson API HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("No response content from Gemini lesson API");

  return JSON.parse(rawText.trim());
}

// Generate using OpenAI or OpenRouter API
async function generateWithOpenAI(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  modelName: string,
  provider: 'openai' | 'openrouter'
): Promise<LessonResult> {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const sourceName = languageNames[sourceLang] || sourceLang;

  const prompt = `You are a professional language tutor.
Create a mini-lesson in Portuguese to help a student learn the language of the source text (${sourceName}) based on the captured translation pair:
Source Text (${sourceLang}): "${sourceText}"
Translated Text (${targetLang}): "${translatedText}"

Requirements:
1. Explain 1-2 grammar points observed in the source text.
2. Define 2-3 important vocabulary words or idioms from the source text.
3. Create a 4-option multiple-choice quiz question in Portuguese testing the student on these words or grammar points.
4. Keep all explanations, meanings, and quiz elements in Portuguese so the student can study easily.`;

  const systemPrompt = `You are a professional language tutor.
You must return your response as a JSON object matching this schema:
{
  "lessonTitle": "A short, engaging title for the lesson.",
  "grammarPoints": [
    {
      "point": "Name of the grammar concept.",
      "explanation": "Brief explanation in Portuguese.",
      "exampleOriginal": "An example sentence in the source language.",
      "exampleTranslated": "The Portuguese translation of the example sentence."
    }
  ],
  "vocabulary": [
    {
      "word": "Word or idiom from the source text.",
      "meaning": "Meaning or translation of the word in Portuguese.",
      "usage": "Example of usage in a short sentence in the source language."
    }
  ],
  "quiz": {
    "question": "A multiple-choice quiz question in Portuguese.",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0, // 0-based index of correct option
    "explanation": "Detailed explanation in Portuguese of why the answer is correct."
  }
}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/dgsolutionweb/gemini3.5';
    headers['X-Title'] = 'Tradutor macOS';
  }

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
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`${provider} lesson API HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error(`No response content from ${provider} lesson API`);

  return JSON.parse(rawText.trim());
}

// Main execution function
export async function generateLesson(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  apiMode: 'gemini' | 'openai' | 'openrouter' | 'free',
  apiKey: string,
  modelName: string = 'gemini-1.5-flash'
): Promise<LessonResult> {
  const trimmedSource = sourceText.trim();
  const trimmedTarget = translatedText.trim();
  
  if (!trimmedSource || !trimmedTarget) {
    return {
      lessonTitle: "Recorte um texto para gerar a lição",
      grammarPoints: [],
      vocabulary: [],
      quiz: {
        question: "Pronto para aprender?",
        options: [],
        correctIndex: 0,
        explanation: ""
      }
    };
  }

  try {
    if (apiMode === 'gemini' && apiKey) {
      return await generateWithGemini(trimmedSource, trimmedTarget, sourceLang, targetLang, apiKey, modelName);
    } else if (apiMode === 'openai' && apiKey) {
      return await generateWithOpenAI(trimmedSource, trimmedTarget, sourceLang, targetLang, apiKey, modelName, 'openai');
    } else if (apiMode === 'openrouter' && apiKey) {
      return await generateWithOpenAI(trimmedSource, trimmedTarget, sourceLang, targetLang, apiKey, modelName, 'openrouter');
    } else {
      return generateMockLesson(trimmedSource, targetLang);
    }
  } catch (error) {
    console.error("Lesson generation API failed, falling back to mock lesson:", error);
    return generateMockLesson(trimmedSource, targetLang);
  }
}
