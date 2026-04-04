import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateSpeech(text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this book excerpt clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("TTS Generation Error:", error);
    return null;
  }
}

export async function searchBooks(query: string, filters?: { author?: string, genre?: string, dateRangeStart?: string, dateRangeEnd?: string, keywords?: string }) {
  // We'll use Gemini to "search" or simulate a search if no real API is provided, 
  // but for a real app, we'd use Google Books API.
  // Let's use Gemini to recommend books based on the query and filters.
  try {
    let prompt = `Search for books related to: "${query}".`;
    if (filters) {
      if (filters.author) prompt += ` Filter by author: "${filters.author}".`;
      if (filters.genre) prompt += ` Filter by genre: "${filters.genre}".`;
      if (filters.dateRangeStart || filters.dateRangeEnd) {
        prompt += ` Filter by publication date range: from "${filters.dateRangeStart || 'any'}" to "${filters.dateRangeEnd || 'any'}".`;
      }
      if (filters.keywords) prompt += ` Include keyword search in titles and descriptions: "${filters.keywords}".`;
    }
    prompt += ` Return a JSON array of objects with: id, title, authors (array), thumbnail (placeholder URL), description (extensive), publicationDate, genre, and a short sample content (1-2 paragraphs).`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Search Error:", error);
    return [];
  }
}

export async function getRecommendations(readingHistory: string[], preferences: string) {
  try {
    const prompt = `Based on the user's reading history: [${readingHistory.join(', ')}] and stated preferences: "${preferences}", recommend 6 books they might enjoy. 
    Return a JSON array of objects with: id, title, authors (array), thumbnail (placeholder URL), description (extensive), publicationDate, genre, and a short sample content (1-2 paragraphs).`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Recommendations Error:", error);
    return [];
  }
}
