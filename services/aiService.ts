
import { GoogleGenAI } from "@google/genai";

// Fix: Lazy initialization to prevent crash if key is missing
let ai: GoogleGenAI | null = null;

const getAi = () => {
  if (!ai) {
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("AI Service: Missing API Key");
      return null;
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
};

export const getMeetingSummary = async (transcript: string) => {
  try {
    const client = getAi();
    if (!client) return "AI Configuration Error: Missing API Key.";

    // Use safe model and correct content structure
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [{
          text: `You are an expert AI meeting assistant. Summarize the following meeting transcript into key action items and main points.\n\nTranscript:\n${transcript}`
        }]
      }]
    });

    // Handle generic response
    return response.text || "No summary generated.";

  } catch (error) {
    console.error("AI Error:", error);
    return "Failed to generate AI summary. Please check your API Key or try again later.";
  }
};

export const answerMeetingQuestion = async (context: string, question: string) => {
  try {
    const client = getAi();
    if (!client) return "AI Configuration Error: Missing API Key.";

    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [{
          text: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`
        }]
      }]
    });

    return response.text || "I couldn't generate an answer.";
  } catch (error) {
    console.error("AI Error:", error);
    return "AI assistant is currently unavailable.";
  }
};
