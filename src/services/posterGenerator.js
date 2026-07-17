const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const FormData = require("form-data");

class PosterGenerator {
  constructor() {
    this.stabilityEndpoint =
      process.env.STABILITY_POSTER_ENDPOINT ||
      "https://api.stability.ai/v2beta/stable-image/generate/core";
    this.pollinationsUrl =
      process.env.POSTER_IMAGE_API_URL || "https://image.pollinations.ai/prompt";
    this.timeoutMs = Number(process.env.POSTER_GENERATION_TIMEOUT_MS) || 120000;
  }

  getStabilityApiKey() {
    return String(process.env.STABILITY_API_KEY || "").trim();
  }

  usesStability() {
    return Boolean(this.getStabilityApiKey());
  }

  mapNewsCategory(category) {
    const c = String(category || "general").toLowerCase();
    if (c === "achievement") return "achievement";
    if (c === "holiday") return "holiday";
    if (c === "event") return "event";
    return "news";
  }

  buildPrompt(description, posterCategory, colorPalette) {
    const colorHints = this.getColorHints(colorPalette);
    const categoryHints = this.getCategoryHints(posterCategory);

    const tone =
      posterCategory === "event"
        ? "festive and energetic"
        : "clean and authoritative";

    return `Create a professional ${categoryHints.label} poster for Elimu Plus:

EVENT/NEWS: ${description}

DESIGN REQUIREMENTS:
- Style: Modern, professional, eye-catching
- Color scheme: ${colorHints.colorScheme}
- Primary colors: ${colorHints.colors.join(", ")}
- Theme: ${categoryHints.theme}
- Mood: ${categoryHints.mood}

FORMAT: High quality, ${tone} design, leave space for text overlay.

SCHOOL: Elimu Plus - Excellence in Education`;
  }

  getColorHints(palette) {
    const palettes = {
      festive: {
        colors: ["#FF6B35", "#F7931E", "#FFD700", "#2EC4B6"],
        colorScheme: "vibrant, warm, energetic, celebration colors",
      },
      academic: {
        colors: ["#1A365D", "#2B6CB0", "#E2E8F0", "#C53030"],
        colorScheme: "professional, navy blue, gold accents, formal",
      },
      sports: {
        colors: ["#E53E3E", "#DD6B20", "#38A169", "#D69E2E"],
        colorScheme: "bold, dynamic, energetic, action-oriented",
      },
      news: {
        colors: ["#2D3748", "#4A5568", "#E2E8F0", "#3182CE"],
        colorScheme: "clean, serious, newspaper style, professional",
      },
      spring: {
        colors: ["#F687B3", "#9AE6B4", "#F6E05E", "#81E6D9"],
        colorScheme: "pastel, fresh, blooming, cheerful",
      },
    };
    const key = palette && palettes[palette] ? palette : "academic";
    return palettes[key];
  }

  getCategoryHints(category) {
    const hints = {
      event: {
        label: "school event",
        theme: "festive, celebration, community gathering",
        mood: "energetic, welcoming, exciting",
      },
      news: {
        label: "school news",
        theme: "announcement, important update, school communication",
        mood: "professional, trustworthy, clear",
      },
      achievement: {
        label: "achievement",
        theme: "celebration, success, recognition",
        mood: "proud, inspiring, motivational",
      },
      holiday: {
        label: "holiday",
        theme: "festive, seasonal celebration",
        mood: "joyful, warm, family-oriented",
      },
    };
    return hints[category] || hints.news;
  }

  parseStabilityError(error) {
    const data = error?.response?.data;
    if (!data) return error.message || "Stability AI request failed";

    try {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      const json = JSON.parse(text);
      if (Array.isArray(json.errors) && json.errors.length) {
        return json.errors.map((e) => e.message || e).join("; ");
      }
      return json.message || json.name || text;
    } catch {
      return error.message || "Stability AI request failed";
    }
  }

  async fetchImageFromStability(prompt) {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("output_format", process.env.STABILITY_POSTER_OUTPUT_FORMAT || "png");
    form.append("aspect_ratio", process.env.STABILITY_POSTER_ASPECT_RATIO || "1:1");

    const negativePrompt = process.env.STABILITY_POSTER_NEGATIVE_PROMPT;
    if (negativePrompt) {
      form.append("negative_prompt", negativePrompt);
    }

    const response = await axios.post(this.stabilityEndpoint, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${this.getStabilityApiKey()}`,
        Accept: "image/*",
      },
      responseType: "arraybuffer",
      timeout: this.timeoutMs,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    if (!response.data || response.data.byteLength === 0) {
      throw new Error("Stability AI returned an empty image");
    }

    return Buffer.from(response.data);
  }

  async fetchImageFromPollinations(prompt) {
    const requestUrl = `${this.pollinationsUrl}/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux`;
    const response = await axios.get(requestUrl, {
      responseType: "arraybuffer",
      timeout: this.timeoutMs,
    });
    return Buffer.from(response.data);
  }

  async fetchImageBuffer(prompt) {
    if (this.usesStability()) {
      try {
        const buffer = await this.fetchImageFromStability(prompt);
        return { buffer, provider: "stability", model: "stable-image-core" };
      } catch (error) {
        const message = this.parseStabilityError(error);
        throw new Error(`Stability AI poster generation failed: ${message}`);
      }
    }

    const buffer = await this.fetchImageFromPollinations(prompt);
    return { buffer, provider: "pollinations", model: "flux" };
  }

  async savePosterImage(buffer, kind) {
    const subfolder = kind === "event" ? "events" : "news";
    const uploadRoot = path.join(__dirname, "..", "..", "uploads", "posters", subfolder);
    await fs.mkdir(uploadRoot, { recursive: true });
    const filename = `${crypto.randomUUID()}.png`;
    const filepath = path.join(uploadRoot, filename);
    await fs.writeFile(filepath, buffer);
    return `/uploads/posters/${subfolder}/${filename}`;
  }

  async generatePoster(description, posterCategory, colorPaletteKey, kind = "news") {
    const enhancedPrompt = this.buildPrompt(description, posterCategory, colorPaletteKey);
    const { buffer, provider, model } = await this.fetchImageBuffer(enhancedPrompt);
    const imageUrl = await this.savePosterImage(buffer, kind);

    return {
      success: true,
      imageUrl,
      prompt: enhancedPrompt,
      metadata: {
        provider,
        model,
        size: "1024x1024",
        timestamp: new Date().toISOString(),
      },
    };
  }
}

module.exports = new PosterGenerator();
