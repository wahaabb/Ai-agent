
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
  },
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

router.post("/", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No audio file received.",
      });
    }

    const transcription = await groq.audio.transcriptions.create({
      file: await OpenAI.toFile(
        req.file.buffer,
        req.file.originalname || "recording.webm"
      ),
      model: "whisper-large-v3",
    });

    res.json({
      text: transcription.text,
    });
  } catch (error) {
    console.error("Transcription error:", error);

    res.status(500).json({
      error: "Audio transcription failed.",
    });
  }
});

module.exports = router;
