import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

console.log("Sending request...");

try {
  const response = await ai.interactions.create({
    model: "gemini-3.8-flash",
    input: "Say hello in one short sentence.",
  });

  console.log("Response:");
  console.log(response.output_text);
} catch (error) {
  console.error("ERROR:");
  console.error(error);
}