// ========================================
// 🛠️ UTILITÁRIOS DO CARBOT
// ========================================

function splitMessage(text, maxLength = 2000) {
    if (!text) return [];

    const chunks = [];
    let remaining = String(text);

    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf("\n", maxLength);

        if (splitAt <= 0) {
            splitAt = remaining.lastIndexOf(" ", maxLength);
        }

        if (splitAt <= 0) {
            splitAt = maxLength;
        }

        chunks.push(
            remaining.slice(0, splitAt).trim()
        );

        remaining = remaining
            .slice(splitAt)
            .trimStart();
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
}

function getAIErrorMessage(error) {
    switch (error?.message) {
        case "HF_AUTH":
            return "🔐 O token da IA está inválido ou expirou.";

        case "HF_RATE_LIMIT":
            return "⏳ A IA está recebendo muitas requisições. Tenta novamente daqui a pouco.";

        case "HF_MODEL_NOT_FOUND":
            return "🤖 O modelo de IA configurado não está disponível no momento.";

        case "HF_TIMEOUT":
            return "⏱️ A IA demorou demais para responder. Tenta novamente.";

        default:
            return "❌ Deu erro ao falar com a inteligência artificial.";
    }
}

function normalizeHFError(error) {
    const status =
        error?.status ??
        error?.response?.status ??
        error?.statusCode;

    if (status === 401 || status === 403) {
        return new Error("HF_AUTH");
    }

    if (status === 429) {
        return new Error("HF_RATE_LIMIT");
    }

    if (status === 404) {
        return new Error("HF_MODEL_NOT_FOUND");
    }

    if (
        status === 408 ||
        status === 504 ||
        error?.name === "AbortError"
    ) {
        return new Error("HF_TIMEOUT");
    }

    return new Error("HF_UNKNOWN");
}

function defaultPersonality() {
    return `
Você é o Carbot, um bot brasileiro de Discord.

Responda sempre em português, de forma amigável,
útil e descontraída.

Você pode usar emojis quando fizer sentido.

Seu criador é o longhorn2004 (<@1417274590937223168>).
`.trim();
}

module.exports = {
    splitMessage,
    getAIErrorMessage,
    normalizeHFError,
    defaultPersonality
};